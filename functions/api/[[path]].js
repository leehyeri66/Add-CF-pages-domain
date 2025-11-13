// 处理 CORS 预检
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Account-Id, X-Api-Token',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  // 优先从请求头读取，其次从环境变量
  const apiToken = request.headers.get('X-Api-Token') || env.CLOUDFLARE_API_TOKEN;
  const accountId = request.headers.get('X-Account-Id');
  
  // 调试日志
  console.log('Headers received:', {
    hasToken: !!apiToken,
    hasAccountId: !!accountId,
    tokenPrefix: apiToken ? apiToken.substring(0, 10) + '...' : 'none'
  });
  
  if (!apiToken) {
    return jsonResponse({ 
      success: false, 
      error: '未提供 API Token，请检查输入' 
    }, 401);
  }

  const match = path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  
  if (!match) {
    return jsonResponse({ 
      success: false, 
      error: '路由不匹配: ' + path 
    }, 400);
  }

  const [, accountIdFromPath, projectName, domain] = match;
  const finalAccountId = accountId || accountIdFromPath;
  
  // 获取项目列表
  if (!projectName) {
    return await proxyCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects`,
      'GET',
      null,
      apiToken
    );
  }
  
  // 获取域名列表
  if (projectName && !domain && request.method === 'GET') {
    return await proxyCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains`,
      'GET',
      null,
      apiToken
    );
  }
  
  // 添加域名 + DNS
  if (projectName && !domain && request.method === 'POST') {
    try {
      const requestBody = await request.json();
      const domainName = requestBody.name;
      const createDns = requestBody.create_dns;
      
      // 添加域名到 Pages
      const addResult = await proxyCloudflare(
        `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains`,
        'POST',
        { name: domainName },
        apiToken
      );
      
      const resultData = await addResult.json();
      
      // 如果成功且需要创建 DNS
      if (createDns && resultData.success) {
        const parts = domainName.split('.');
        const parentDomain = parts.slice(-2).join('.');
        
        // 获取 Zone
        const zonesResp = await fetch(
          `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,
          {
            headers: { 'Authorization': `Bearer ${apiToken}` }
          }
        );
        const zonesData = await zonesResp.json();
        
        if (zonesData.success && zonesData.result?.length > 0) {
          const zoneId = zonesData.result[0].id;
          
          // 创建 CNAME
          const dnsResp = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                type: 'CNAME',
                name: domainName,
                content: `${projectName}.pages.dev`,
                proxied: true
              })
            }
          );
          
          const dnsData = await dnsResp.json();
          resultData.dns_created = dnsData.success;
          resultData.dns_info = dnsData;
        }
      }
      
      return jsonResponse(resultData);
    } catch (error) {
      return jsonResponse({ 
        success: false, 
        error: error.message 
      }, 500);
    }
  }
  
  // 删除域名
  if (projectName && domain && request.method === 'DELETE') {
    return await proxyCloudflare(
      `https://api.cloudflare.com/client/v4/accounts/${finalAccountId}/pages/projects/${projectName}/domains/${domain}`,
      'DELETE',
      null,
      apiToken
    );
  }

  return jsonResponse({ success: false, error: '未知操作' }, 400);
}

// 辅助函数：代理 Cloudflare API
async function proxyCloudflare(url, method, body, token) {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    const data = await response.json();
    return jsonResponse(data, response.status);
  } catch (error) {
    return jsonResponse({ 
      success: false, 
      error: error.message 
    }, 500);
  }
}

// 辅助函数：返回 JSON
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Account-Id, X-Api-Token'
    }
  });
}

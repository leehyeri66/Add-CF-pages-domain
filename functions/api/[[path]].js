// functions/api/[[path]].js
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: '未配置 CLOUDFLARE_API_TOKEN 环境变量' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  // 匹配路由
  // /api/accounts/:accountId/projects
  // /api/accounts/:accountId/projects/:projectName/domains
  // /api/accounts/:accountId/projects/:projectName/domains/:domain
  const acctMatch = path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);

  if (!acctMatch) {
    return new Response(JSON.stringify({ success: false, error: '无效的路由' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const [, accountId, projectName, domain] = acctMatch;
  let cfApiUrl = '';
  let method = request.method;
  let body = null;

  // 1. 列出项目
  if (!projectName) {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
    method = 'GET';
  } 
  // 2. 获取某个 Pages 项目现有域名
  else if (projectName && !domain && method === 'GET') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    method = 'GET';
  }
  // 3. 添加域名
  else if (projectName && !domain && method === 'POST') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    method = 'POST';
    body = await request.json();
  }
  // 4. 删除域名
  else if (projectName && domain && method === 'DELETE') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains/${domain}`;
    method = 'DELETE';
  }

  if (!cfApiUrl) {
    return new Response(JSON.stringify({ success: false, error: '无效操作' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const cfResponse = await fetch(cfApiUrl, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const data = await cfResponse.json();
    return new Response(JSON.stringify(data), {
      status: cfResponse.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

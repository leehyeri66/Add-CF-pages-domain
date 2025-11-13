export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '未配置 CLOUDFLARE_API_TOKEN 环境变量' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const match = path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  
  if (!match) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '无效的路由' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const [, accountId, projectName, domain] = match;
  let cfApiUrl = '';
  let method = request.method;
  let body = null;

  if (!projectName) {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`;
    method = 'GET';
  } 
  else if (projectName && !domain && method === 'GET') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    method = 'GET';
  }
  else if (projectName && !domain && method === 'POST') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`;
    method = 'POST';
    body = await request.json();
    
    if (body.domain || body.domain_name) {
      body = { name: body.domain || body.domain_name };
    }
  }
  else if (projectName && domain && method === 'DELETE') {
    cfApiUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains/${domain}`;
    method = 'DELETE';
  }

  if (!cfApiUrl) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: '无效操作' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

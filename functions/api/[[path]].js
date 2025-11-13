export async function onRequest(context){
  const{request}=context;
  const url=new URL(request.url);
  const path=url.pathname;
  
  const pagesToken=request.headers.get('X-Pages-Token');
  const zoneToken=request.headers.get('X-Zone-Token');
  const accountId=request.headers.get('X-Account-Id');
  
  if(!pagesToken)return jsonErr('未提供 Pages Token',401);
  
  const match=path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  if(!match)return jsonErr('无效路由',400);
  
  const[,accId,projectName,domain]=match;
  const finalAccId=accountId||accId;
  
  if(!projectName){
    return await proxy(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects`,'GET',null,pagesToken);
  }
  
  if(projectName&&!domain&&request.method==='GET'){
    return await proxy(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains`,'GET',null,pagesToken);
  }
  
  if(projectName&&!domain&&request.method==='POST'){
    const body=await request.json();
    const domainName=body.name;
    
    const addResp=await fetch(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${pagesToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({name:domainName})
    });
    const addData=await addResp.json();
    
    if(addData.success&&zoneToken){
      const parts=domainName.split('.');
      const parentDomain=parts.slice(-2).join('.');
      const zonesResp=await fetch(`https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,{
        headers:{'Authorization':`Bearer ${zoneToken}`}
      });
      const zonesData=await zonesResp.json();
      
      if(zonesData.success&&zonesData.result?.length>0){
        const zoneId=zonesData.result[0].id;
        const dnsResp=await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,{
          method:'POST',
          headers:{'Authorization':`Bearer ${zoneToken}`,'Content-Type':'application/json'},
          body:JSON.stringify({
            type:'CNAME',
            name:domainName,
            content:`${projectName}.pages.dev`,
            proxied:true
          })
        });
        const dnsData=await dnsResp.json();
        addData.dns_created=dnsData.success;
        addData.dns_info=dnsData;
      }
    }
    
    return new Response(JSON.stringify(addData),{
      status:addResp.status,
      headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}
    });
  }
  
  if(projectName&&domain&&request.method==='DELETE'){
    return await proxy(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains/${domain}`,'DELETE',null,pagesToken);
  }
  
  return jsonErr('无效操作',400);
}

async function proxy(url,method,body,token){
  const resp=await fetch(url,{
    method,
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:body?JSON.stringify(body):undefined
  });
  const data=await resp.json();
  return new Response(JSON.stringify(data),{
    status:resp.status,
    headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}
  });
}

function jsonErr(msg,status){
  return new Response(JSON.stringify({success:false,error:msg}),{
    status,
    headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
  });
}

export async function onRequestOptions(){
  return new Response(null,{
    headers:{
      'Access-Control-Allow-Origin':'*',
      'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type,X-Account-Id,X-Pages-Token,X-Zone-Token'
    }
  });
}

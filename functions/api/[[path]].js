export async function onRequest(context){
  const{request,env}=context;
  const url=new URL(request.url);
  const path=url.pathname;
  
  if(path==='/api/auth'&&request.method==='POST'){
    const body=await request.json();
    const password=body.password;
    const correctPassword=env.PASSWORD||'admin';
    
    if(password===correctPassword){
      return new Response(JSON.stringify({success:true}),{
        headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
      });
    }else{
      return new Response(JSON.stringify({success:false}),{
        status:401,
        headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
      });
    }
  }
  
  if(path==='/api/config'){
    if(request.method==='POST'){
      const config=await request.json();
      await env.CONFIG_KV.put('user_config',JSON.stringify(config));
      return new Response(JSON.stringify({success:true}),{
        headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
      });
    }else if(request.method==='GET'){
      const configStr=await env.CONFIG_KV.get('user_config');
      const config=configStr?JSON.parse(configStr):null;
      return new Response(JSON.stringify({success:true,config}),{
        headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
      });
    }
  }
  
  const pagesToken=request.headers.get('X-Pages-Token');
  const zoneToken=request.headers.get('X-Zone-Token');
  const accountId=request.headers.get('X-Account-Id');
  
  if(!pagesToken)return jsonErr('未提供 Pages Token',401);
  
  const match=path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
  if(!match)return jsonErr('无效路由',400);
  
  const[,accId,projectName,domain]=match;
  const finalAccId=accountId||accId;
  
  // 获取所有项目（支持分页）
  if(!projectName){
    let allProjects = [];
    let page = 1;
    let hasMore = true;
    
    while(hasMore){
      try{
        const resp = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects?page=${page}`,
          {
            headers: {
              'Authorization': `Bearer ${pagesToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const data = await resp.json();
        
        if(data.success && data.result && data.result.length > 0){
          allProjects = allProjects.concat(data.result);
          
          // 检查是否还有下一页
          if(data.result_info && data.result_info.total_pages > page){
            page++;
          }else{
            hasMore = false;
          }
        }else{
          hasMore = false;
        }
      }catch(e){
        hasMore = false;
      }
    }
    
    return new Response(JSON.stringify({
      success: true,
      result: allProjects,
      result_info: {
        count: allProjects.length,
        total_count: allProjects.length
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  if(projectName&&!domain&&request.method==='GET'){
    return await proxy(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains`,'GET',null,pagesToken);
  }
  
  if(projectName&&!domain&&request.method==='POST'){
    const body=await request.json();
    const domainName=body.name;
    
    const projectResp=await fetch(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}`,{
      headers:{'Authorization':`Bearer ${pagesToken}`}
    });
    const projectData=await projectResp.json();
    
    let pagesDevDomain=`${projectName}.pages.dev`;
    if(projectData.success&&projectData.result?.subdomain){
      pagesDevDomain=projectData.result.subdomain;
      if(!pagesDevDomain.endsWith('.pages.dev')){
        pagesDevDomain+='.pages.dev';
      }
    }
    
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
            content:pagesDevDomain,
            proxied:true
          })
        });
        const dnsData=await dnsResp.json();
        addData.dns_created=dnsData.success;
        addData.dns_target=pagesDevDomain;
      }
    }
    
    return new Response(JSON.stringify(addData),{
      status:addResp.status,
      headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
    });
  }
  
  if(projectName&&domain&&request.method==='DELETE'){
    const deleteResp=await fetch(`https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains/${domain}`,{
      method:'DELETE',
      headers:{'Authorization':`Bearer ${pagesToken}`}
    });
    const deleteData=await deleteResp.json();
    
    if(deleteData.success&&zoneToken){
      const parts=domain.split('.');
      const parentDomain=parts.slice(-2).join('.');
      
      const zonesResp=await fetch(`https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,{
        headers:{'Authorization':`Bearer ${zoneToken}`}
      });
      const zonesData=await zonesResp.json();
      
      if(zonesData.success&&zonesData.result?.length>0){
        const zoneId=zonesData.result[0].id;
        
        const dnsListResp=await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${domain}`,{
          headers:{'Authorization':`Bearer ${zoneToken}`}
        });
        const dnsListData=await dnsListResp.json();
        
        if(dnsListData.success&&dnsListData.result?.length>0){
          const recordId=dnsListData.result[0].id;
          const deleteDnsResp=await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,{
            method:'DELETE',
            headers:{'Authorization':`Bearer ${zoneToken}`}
          });
          const deleteDnsData=await deleteDnsResp.json();
          deleteData.dns_deleted=deleteDnsData.success;
        }
      }
    }
    
    return new Response(JSON.stringify(deleteData),{
      status:deleteResp.status,
      headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
    });
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
    headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}
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

export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // 身份验证接口
    if (path === '/api/auth' && request.method === 'POST') {
        const body = await request.json();
        const password = body.password;
        const correctPassword = env.PASSWORD || 'admin';
        
        if (password === correctPassword) {
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        } else {
            return new Response(JSON.stringify({ success: false }), {
                status: 401,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }
    }

    // 配置管理接口
    if (path === '/api/config') {
        if (request.method === 'POST') {
            const config = await request.json();
            await env.CONFIG_KV.put('user_config', JSON.stringify(config));
            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        } else if (request.method === 'GET') {
            const configStr = await env.CONFIG_KV.get('user_config');
            const config = configStr ? JSON.parse(configStr) : null;
            return new Response(JSON.stringify({ success: true, config }), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }
    }

    // Pages API 处理
    const pagesToken = request.headers.get('X-Pages-Token');
    const zoneToken = request.headers.get('X-Zone-Token');
    const accountId = request.headers.get('X-Account-Id');
    
    if (!pagesToken) return jsonErr('未提供 Pages Token', 401);

    const match = path.match(/^\/api\/accounts\/([^\/]+)\/projects(?:\/([^\/]+))?(?:\/domains)?(?:\/([^\/]+))?$/);
    if (!match) return jsonErr('无效路由', 400);

    const [, accId, projectName, domain] = match;
    const finalAccId = accountId || accId;

    // 获取所有项目
    if (!projectName) {
        let allProjects = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            try {
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
                
                if (data.success && data.result && data.result.length > 0) {
                    allProjects = allProjects.concat(data.result);
                    if (data.result_info && data.result_info.total_pages > page) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            } catch (e) {
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

    // 获取项目域名列表
    if (projectName && !domain && request.method === 'GET') {
        return await proxy(
            `https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains`,
            'GET',
            null,
            pagesToken
        );
    }

    // 添加域名 + DNS 记录（修复版）
    if (projectName && !domain && request.method === 'POST') {
        const body = await request.json();
        const domainName = body.name;

        // 获取项目信息
        const projectResp = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}`,
            { headers: { 'Authorization': `Bearer ${pagesToken}` } }
        );
        const projectData = await projectResp.json();

        let pagesDevDomain = `${projectName}.pages.dev`;
        if (projectData.success && projectData.result?.subdomain) {
            pagesDevDomain = projectData.result.subdomain;
            if (!pagesDevDomain.endsWith('.pages.dev')) {
                pagesDevDomain += '.pages.dev';
            }
        }

        // 添加域名到 Pages 项目
        const addResp = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pagesToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: domainName })
            }
        );

        const addData = await addResp.json();

        // 创建 DNS 记录
        if (addData.success) {
            // 🔥 关键修复：智能解析父域名
            const parentDomain = await findParentZone(domainName, zoneToken, env);
            
            if (!parentDomain) {
                addData.dns_created = false;
                addData.dns_error = '无法找到匹配的 Zone';
                return new Response(JSON.stringify(addData), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
            }

            // 从 KV 获取该域名对应的 Zone Token
            let effectiveZoneToken = zoneToken;
            const configStr = await env.CONFIG_KV.get('user_config');
            if (configStr) {
                const config = JSON.parse(configStr);
                if (config.zones && config.zones[parentDomain]) {
                    effectiveZoneToken = config.zones[parentDomain].token;
                }
            }

            if (effectiveZoneToken) {
                try {
                    // 获取 Zone ID
                    const zonesResp = await fetch(
                        `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,
                        { headers: { 'Authorization': `Bearer ${effectiveZoneToken}` } }
                    );
                    const zonesData = await zonesResp.json();

                    if (zonesData.success && zonesData.result?.length > 0) {
                        const zoneId = zonesData.result[0].id;

                        // 检查是否已存在该 DNS 记录
                        const existingResp = await fetch(
                            `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${domainName}`,
                            { headers: { 'Authorization': `Bearer ${effectiveZoneToken}` } }
                        );
                        const existingData = await existingResp.json();

                        if (existingData.success && existingData.result?.length > 0) {
                            // 更新现有记录
                            const recordId = existingData.result[0].id;
                            const updateResp = await fetch(
                                `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${effectiveZoneToken}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        type: 'CNAME',
                                        name: domainName,
                                        content: pagesDevDomain,
                                        proxied: true
                                    })
                                }
                            );
                            const updateData = await updateResp.json();
                            addData.dns_updated = updateData.success;
                            addData.dns_target = pagesDevDomain;
                            addData.dns_record_id = recordId;
                            addData.parent_zone = parentDomain;
                        } else {
                            // 创建新记录
                            const dnsResp = await fetch(
                                `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
                                {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${effectiveZoneToken}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        type: 'CNAME',
                                        name: domainName,
                                        content: pagesDevDomain,
                                        proxied: true,
                                        ttl: 1
                                    })
                                }
                            );
                            const dnsData = await dnsResp.json();
                            addData.dns_created = dnsData.success;
                            addData.dns_target = pagesDevDomain;
                            addData.parent_zone = parentDomain;
                            addData.dns_error = dnsData.success ? null : dnsData.errors;
                        }
                    } else {
                        addData.dns_created = false;
                        addData.dns_error = 'Zone 未找到';
                    }
                } catch (e) {
                    addData.dns_created = false;
                    addData.dns_error = e.message;
                }
            } else {
                addData.dns_created = false;
                addData.dns_error = '未提供 Zone Token';
            }
        }

        return new Response(JSON.stringify(addData), {
            status: addResp.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    // 删除域名 + DNS 记录
    if (projectName && domain && request.method === 'DELETE') {
        const deleteResp = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${finalAccId}/pages/projects/${projectName}/domains/${domain}`,
            {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${pagesToken}` }
            }
        );

        const deleteData = await deleteResp.json();

        if (deleteData.success) {
            const parentDomain = await findParentZone(domain, zoneToken, env);
            
            if (parentDomain) {
                let effectiveZoneToken = zoneToken;
                const configStr = await env.CONFIG_KV.get('user_config');
                if (configStr) {
                    const config = JSON.parse(configStr);
                    if (config.zones && config.zones[parentDomain]) {
                        effectiveZoneToken = config.zones[parentDomain].token;
                    }
                }

                if (effectiveZoneToken) {
                    try {
                        const zonesResp = await fetch(
                            `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,
                            { headers: { 'Authorization': `Bearer ${effectiveZoneToken}` } }
                        );
                        const zonesData = await zonesResp.json();

                        if (zonesData.success && zonesData.result?.length > 0) {
                            const zoneId = zonesData.result[0].id;

                            const dnsListResp = await fetch(
                                `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=CNAME&name=${domain}`,
                                { headers: { 'Authorization': `Bearer ${effectiveZoneToken}` } }
                            );
                            const dnsListData = await dnsListResp.json();

                            if (dnsListData.success && dnsListData.result?.length > 0) {
                                const recordId = dnsListData.result[0].id;
                                const deleteDnsResp = await fetch(
                                    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`,
                                    {
                                        method: 'DELETE',
                                        headers: { 'Authorization': `Bearer ${effectiveZoneToken}` }
                                    }
                                );
                                const deleteDnsData = await deleteDnsResp.json();
                                deleteData.dns_deleted = deleteDnsData.success;
                            }
                        }
                    } catch (e) {
                        deleteData.dns_deleted = false;
                        deleteData.dns_error = e.message;
                    }
                }
            }
        }

        return new Response(JSON.stringify(deleteData), {
            status: deleteResp.status,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }

    return jsonErr('无效操作', 400);
}

// 🔥 新增：智能查找父 Zone
async function findParentZone(domainName, zoneToken, env) {
    // 先尝试从 KV 配置中查找
    const configStr = await env.CONFIG_KV.get('user_config');
    if (configStr) {
        const config = JSON.parse(configStr);
        if (config.zones) {
            const configuredZones = Object.keys(config.zones);
            // 从最长的域名开始匹配（例如 hyeri.us.kg 优先于 us.kg）
            const sorted = configuredZones.sort((a, b) => b.length - a.length);
            for (const zone of sorted) {
                if (domainName === zone || domainName.endsWith('.' + zone)) {
                    return zone;
                }
            }
        }
    }

    // 如果 KV 中没有，尝试通过 API 查找
    if (zoneToken) {
        try {
            const resp = await fetch(
                `https://api.cloudflare.com/client/v4/zones`,
                { headers: { 'Authorization': `Bearer ${zoneToken}` } }
            );
            const data = await resp.json();
            if (data.success && data.result) {
                const zones = data.result.map(z => z.name).sort((a, b) => b.length - a.length);
                for (const zone of zones) {
                    if (domainName === zone || domainName.endsWith('.' + zone)) {
                        return zone;
                    }
                }
            }
        } catch (e) {
            console.error('查找 Zone 失败:', e);
        }
    }

    return null;
}

async function proxy(url, method, body, token) {
    const resp = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

function jsonErr(msg, status) {
    return new Response(JSON.stringify({ success: false, error: msg }), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type,X-Account-Id,X-Pages-Token,X-Zone-Token'
        }
    });
}

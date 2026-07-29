/**
 * 修改说明：
 * 1. 移除了旧版的 "std/http/server.ts" 导入，改为使用内置的 Deno.serve。
 * 2. 增加了跨域 (CORS) 处理逻辑，确保代理在 Web 端调用时不会报错。
 * 3. 保持了原有的 API 映射逻辑。
 */

// API 目标地址映射
const apiMapping: Record<string, string> = {
  '/mistral': 'https://api.mistral.ai',
  '/discord': 'https://discord.com/api',
  '/telegram': 'https://api.telegram.org',
  '/openai': 'https://api.openai.com',
  '/claude': 'https://api.anthropic.com',
  '/gemini': 'https://generativelanguage.googleapis.com',
  '/meta': 'https://www.meta.ai/api',
  '/groq': 'https://api.groq.com/openai',
  '/xai': 'https://api.x.ai',
  '/cohere': 'https://api.cohere.ai',
  '/huggingface': 'https://api-inference.huggingface.co',
  '/together': 'https://api.together.xyz',
  '/novita': 'https://api.novita.ai',
  '/portkey': 'https://api.portkey.ai',
  '/fireworks': 'https://api.fireworks.ai',
  '/openrouter': 'https://openrouter.ai/api'
};

console.log("Deno Proxy Server starting on new Deno Deploy platform...");

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search;

  // 1. 处理 CORS 预检请求 (Preflight)
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 2. 处理根路径和 index.html
  if (pathname === '/' || pathname === '/index.html') {
    return new Response('<h1>Service is running on New Deno Deploy!</h1>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 3. 处理 robots.txt
  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 4. 提取 API 前缀和剩余路径
  const [prefix, rest] = extractPrefixAndRest(pathname, Object.keys(apiMapping));

  if (!prefix) {
    console.log(`No matching prefix for: ${pathname}`);
    return new Response('Not Found', { status: 404 });
  }

  // 构建目标 URL
  const targetUrl = `${apiMapping[prefix]}${rest}${search}`;
  console.log(`Forwarding: ${request.method} ${pathname} -> ${targetUrl}`);

  try {
    // 5. 准备转发的请求头
    const headers = new Headers();
    const allowedHeaders = [
        'accept',
        'content-type',
        'authorization',
        'x-goog-api-key',
        'anthropic-version',
        'x-api-key'
    ];

    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey) || lowerKey.startsWith('x-')) {
        headers.set(key, value);
      }
    }

    // 转发 User-Agent
    const ua = request.headers.get('user-agent');
    if (ua) headers.set('User-Agent', ua);

    // 6. 发起 fetch 请求
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: 'follow'
    });

    // 7. 构造响应并添加安全/CORS 头
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*'); // 允许跨域
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Proxy-By', 'Deno-Deploy-New');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error(`Proxy Error (${targetUrl}):`, error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

/**
 * 辅助函数：提取匹配路径
 */
function extractPrefixAndRest(pathname: string, prefixes: string[]): [string | null, string | null] {
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      const rest = pathname.slice(prefix.length);
      if (rest.length === 0 || rest.startsWith('/')) {
         return [prefix, rest];
      }
    }
  }
  return [null, null];
}

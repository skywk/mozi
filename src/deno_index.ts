import { serve } from "https://deno.land/std/http/server.ts";

// API 目标地址映射
const apiMapping = {
  '/mistral': 'https://api.mistral.ai',
  '/discord': 'https://discord.com/api',
  '/telegram': 'https://api.telegram.org',
  '/openai': 'https://api.openai.com',
  '/claude': 'https://api.anthropic.com',
  '/gemini': 'https://generativelanguage.googleapis.com', // Gemini API Endpoint
  '/meta': 'https://www.meta.ai/api', // 注意：Meta 的公共 API 可能不稳定或不存在
  '/groq': 'https://api.groq.com/openai',
  '/xai': 'https://api.x.ai', // 注意：X.AI 的公共 API 可能有限制或不存在
  '/cohere': 'https://api.cohere.ai',
  '/huggingface': 'https://api-inference.huggingface.co',
  '/together': 'https://api.together.xyz',
  '/novita': 'https://api.novita.ai',
  '/portkey': 'https://api.portkey.ai',
  '/fireworks': 'https://api.fireworks.ai',
  '/openrouter': 'https://openrouter.ai/api'
};

console.log("Starting proxy server...");

serve(async (request: Request) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const search = url.search; // 保留查询参数

  console.log(`Received request: ${request.method} ${pathname}${search}`);

  // 处理根路径和 index.html
  if (pathname === '/' || pathname === '/index.html') {
    return new Response('Service is running!', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // 处理 robots.txt
  if (pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }

  // 提取 API 前缀和剩余路径
  const [prefix, rest] = extractPrefixAndRest(pathname, Object.keys(apiMapping));

  // 如果找不到匹配的前缀，返回 404
  if (!prefix) {
    console.log(`No matching prefix found for path: ${pathname}`);
    return new Response('Not Found', { status: 404 });
  }

  // 构建目标 URL，包含原始的查询参数
  const targetUrl = `${apiMapping[prefix]}${rest}${search}`;

  try {
    // 准备转发的请求头
    const headers = new Headers();
    // 定义允许转发的请求头列表 (小写)
    // *** 关键改动：添加了 'x-goog-api-key' ***
    const allowedHeaders = [
        'accept',
        'content-type',
        'authorization', // 通用认证头 (如 Bearer Token)
        'x-goog-api-key', // Google API Key Header
        // 可以根据需要添加其他 API 可能需要的头，例如：
        // 'anthropic-version', // Claude API 版本
        // 'x-api-key', // 其他服务可能使用的 API Key Header 名称
    ];

    // 遍历原始请求头，只复制允许的头
    for (const [key, value] of request.headers.entries()) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaders.includes(lowerKey)) {
        headers.set(key, value); // 保留原始的大小写
        console.log(`Forwarding header: ${key}: ${value.startsWith('sk-') || value.startsWith('AIza') ? '***' : value}`); // 简单隐藏可能的 Key
      } else {
        // console.log(`Skipping header: ${key}`); // 取消注释以查看被跳过的头
      }
    }

    // 考虑是否需要转发 User-Agent，有些 API 可能需要
    if (request.headers.has('user-agent')) {
       headers.set('User-Agent', request.headers.get('user-agent')!);
       console.log(`Forwarding User-Agent: ${request.headers.get('user-agent')}`);
    }


    console.log(`Forwarding request to: ${targetUrl}`);
    // console.log("Forwarding headers:", Object.fromEntries(headers.entries())); // 打印所有将要转发的头

    // 发起实际的 fetch 请求到目标 API
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers, // 使用过滤和处理后的请求头
      body: request.body, // 直接传递请求体
      // Deno 的 fetch 默认处理重定向，通常不需要手动设置 redirect
    });

    console.log(`Received response status from ${targetUrl}: ${response.status}`);

    // 创建新的响应头，并添加安全相关的头
    const responseHeaders = new Headers(response.headers); // 复制目标 API 的响应头
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('X-Frame-Options', 'DENY');
    responseHeaders.set('Referrer-Policy', 'no-referrer');
    // 可以考虑添加 CORS 头，如果你的前端需要跨域访问这个代理
    // responseHeaders.set('Access-Control-Allow-Origin', '*'); // 谨慎使用 '*'
    // responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    // responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-goog-api-key');

    // 返回从目标 API 收到的响应
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error(`Failed to fetch ${targetUrl}:`, error);
    return new Response('Internal Server Error', { status: 500 });
  }
});

/**
 * 从路径名中提取匹配的前缀和剩余部分
 * @param pathname 请求的路径名，例如 /gemini/v1/models
 * @param prefixes 可能的前缀列表，例如 ['/gemini', '/openai']
 * @returns 返回一个包含匹配前缀和剩余路径的元组 [prefix, rest]，如果没有匹配则返回 [null, null]
 */
function extractPrefixAndRest(pathname: string, prefixes: string[]): [string | null, string | null] {
  // 为了确保最长的前缀被匹配（例如 /v1 和 /v1beta），可以先排序
  // 但在这个场景下，前缀没有重叠，所以直接查找即可
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix)) {
      // 确保匹配的是完整的路径段，避免 /gemini-pro 匹配 /gemini
      // 如果前缀后的第一个字符不是 '/' 且剩余部分不为空，则认为不是正确的匹配
      const rest = pathname.slice(prefix.length);
      if (rest.length === 0 || rest.startsWith('/')) {
         return [prefix, rest];
      }
    }
  }
  return [null, null]; // 没有找到匹配的前缀
}

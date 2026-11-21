// Hosted endpoint: MCP over Streamable HTTP at /mcp, stateless (one server per request, no sessions, nothing stored).
// Run behind a TLS proxy. PORT (default 8090), HOST (default 127.0.0.1), RATE_PER_MIN per client IP (default 60).
import { createServer as httpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, VERSION } from './lib/server.js';

const PORT = Number(process.env.PORT ?? 8090);
const HOST = process.env.HOST ?? '127.0.0.1';
const RATE = Number(process.env.RATE_PER_MIN ?? 60);
const MAX_BODY = 512 * 1024;

const hits = new Map(); // ip -> { n, reset }
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) { hits.set(ip, { n: 1, reset: now + 60_000 }); return false; }
  return ++h.n > RATE;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now > h.reset) hits.delete(ip); }, 60_000).unref();

const json = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const rpcError = (res, status, message) => json(res, status, { jsonrpc: '2.0', error: { code: -32000, message }, id: null });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const http = httpServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, accept, mcp-protocol-version, mcp-session-id');
  res.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (path === '/healthz') return json(res, 200, { ok: true, version: VERSION });
  if (path !== '/mcp') {
    return json(res, 404, { error: 'MCP endpoint is POST /mcp', docs: 'https://github.com/moveinfra/eu-cloud-mcp' });
  }
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return rpcError(res, 405, 'Method not allowed: this server is stateless, use POST.');
  }
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
  if (limited(ip)) return rpcError(res, 429, 'Too many requests, try again in a minute.');

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return rpcError(res, err.message === 'too large' ? 413 : 400, err.message === 'too large' ? 'Request too large.' : 'Invalid JSON.');
  }
  const server = createServer({ hosted: true });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) rpcError(res, 500, 'Internal error.');
  }
});

http.listen(PORT, HOST, () => console.log(`eu-cloud-mcp ${VERSION} listening on http://${HOST}:${PORT}/mcp`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => http.close(() => process.exit(0)));

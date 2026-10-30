import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.map':'application/json' };
/** 可挂载仓库子路径的开发/发布预览服务器；导出工厂供 HTTP 集成验证使用。 */
export function createStaticServer({ root = projectRoot, base = '' } = {}) {
  root = resolve(root);
  base = base.replace(/\/$/, '');
  if (base && (!base.startsWith('/') || base.includes('..'))) throw new Error('Invalid preview base path');
  return http.createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (base && pathname === base) { res.writeHead(302, { Location: base + '/' }); res.end(); return; }
    if (base && !pathname.startsWith(base + '/')) { res.writeHead(404); res.end('Not found'); return; }
    pathname = pathname.slice(base.length);
    let path = resolve(root, '.' + pathname);
    if (path === root || path.startsWith(root + sep)) {
      if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    }
    if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if (!['.html','.js','.css','.map','.json'].includes(extname(path))) { res.writeHead(404); res.end(); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'text/plain', 'Cache-Control':'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const option = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
  const port = Number(option('--port', process.env.PORT || 8080));
  const base = option('--base', ''), root = resolve(projectRoot, option('--root', '.'));
  const server = createStaticServer({ root, base });
  server.on('error', error => { console.error(`无法启动本地服务（端口 ${port}）：${error.message}。可通过 --port 更换端口。`); process.exitCode=1; });
  server.listen(port, '127.0.0.1', () => console.log(`Relic Echo: http://localhost:${port}${base}/`));
}

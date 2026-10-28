// The page under test, served over http from a throwaway server on 127.0.0.1, so the browser never has to
// open a file path (some sandboxes show Node and the browser different views of the disk) and relative
// assets, fetch() and module scripts behave as they will when the page is hosted. The root is the working
// directory when the file is inside it, else the file's folder. Used by inspect.mjs and scenes.mjs.
import { existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, join, relative, dirname, extname, sep } from 'node:path';
import { createServer } from 'node:http';

const MIME = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };

// A URL is returned as it is (server null); a local file is served and its http URL returned. A missing
// file ends the run with exit code 2, as a usage error.
export async function serve(target) {
  if (/^https?:\/\//.test(target)) return { url: target, server: null };
  const file = resolve(target);
  if (!existsSync(file)) { console.error('No such file: ' + file); process.exit(2); }
  const cwd = resolve('.');
  const root = file.startsWith(cwd + sep) ? cwd : dirname(file);
  const server = createServer((req, res) => {
    try {
      let f = resolve(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
      if (f !== root && !f.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
      if (statSync(f).isDirectory()) f = join(f, 'index.html');
      res.writeHead(200, { 'content-type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'content-length': statSync(f).size, 'cache-control': 'no-store' });
      createReadStream(f).pipe(res);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/${relative(root, file).split(sep).map(encodeURIComponent).join('/')}`, server };
}

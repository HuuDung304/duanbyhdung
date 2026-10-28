import { cp, copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
// Store relative, content-versioned URLs in the source HTML too: GitHub Pages and
// Live Server can serve the repository directly, without a build step at runtime.
async function listAssets(directory) {
  const entries = await readdir(new URL(directory, root), { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? listAssets(`${directory}${entry.name}/`)
    : [`./${directory}${entry.name}`]));
  return nested.flat().filter(path => /\.(js|css)$/.test(path)).sort();
}
const assets = await listAssets('src/');
const versions = new Map(await Promise.all(assets.map(async path => {
  const bytes = await readFile(new URL(path, root));
  return [path, `${path}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}`];
})));
const indexUrl = new URL('index.html', root);
let html = await readFile(indexUrl, 'utf8');
html = html.replace(/\s*<script type="importmap" id="app-asset-versions">[\s\S]*?<\/script>/g, '');
html = html.replace(/(<link\b[^>]*href=")(\.\/src\/[^"?]+\.css)(?:\?[^" ]*)?(")/g,
  (_, before, path, after) => `${before}${versions.get(path) || path}${after}`);
html = html.replace(/(<script\b[^>]*type="module"[^>]*src=")(\.\/src\/[^"?]+\.js)(?:\?[^" ]*)?(")/g,
  (_, before, path, after) => `${before}${versions.get(path) || path}${after}`);
const imports = Object.fromEntries([...versions].filter(([path]) => path.endsWith('.js')));
const map = `\n  <script type="importmap" id="app-asset-versions">\n${JSON.stringify({ imports }, null, 2)}\n  </script>\n`;
html = html.replace(/\s*(<script type="module")/, `${map}  $1`);
await writeFile(indexUrl, html);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(indexUrl, new URL('index.html', dist));
await cp(new URL('src/', root), new URL('src/', dist), { recursive: true });
console.log(`Built static application at ${fileURLToPath(dist)}`);

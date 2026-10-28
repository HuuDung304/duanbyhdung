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
// Version the entry module against the complete asset graph, so a dependency
// change also invalidates the entry URL. Keep its import-map URL identical.
const release = createHash('sha256').update(JSON.stringify([...versions])).digest('hex').slice(0, 12);
versions.set('./src/js/main.js', `./src/js/main.js?v=${release}`);
const indexUrl = new URL('index.html', root);
let html = await readFile(indexUrl, 'utf8');
html = html.replace(/<meta name="app-release" content="[^"]*">\s*/g, '');
html = html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n  <meta name="app-release" content="${release}">`);
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

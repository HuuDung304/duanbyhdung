import { cp, copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await copyFile(new URL('index.html', root), new URL('index.html', dist));
await cp(new URL('src/', root), new URL('src/', dist), { recursive: true });
console.log(`Built static application at ${fileURLToPath(dist)}`);

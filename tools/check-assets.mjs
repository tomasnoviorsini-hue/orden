// Verifica que la lista ASSETS de sw.js coincida con los archivos de la app.
// Uso: node tools/check-assets.mjs   (correrlo antes de cada publicación)
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function listFiles(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

const sw = await readFile(join(root, 'sw.js'), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const version = sw.match(/const VERSION = '([^']+)'/)?.[1];

const listed = new Set(assets.filter((asset) => asset !== './'));
const appFiles = [
  'index.html',
  'manifest.webmanifest',
  ...(await listFiles('css')),
  ...(await listFiles('js')),
  ...(await listFiles('icons')),
].map((file) => relative(root, join(root, file)).replaceAll('\\', '/'));

const missingOnDisk = [...listed].filter((asset) => !existsSync(join(root, asset)));
const notCached = appFiles.filter((file) => !listed.has(file));

if (missingOnDisk.length) console.error('En ASSETS pero no existen:', missingOnDisk);
if (notCached.length) console.error('Existen pero faltan en ASSETS (no funcionarán offline):', notCached);

if (missingOnDisk.length || notCached.length) {
  process.exitCode = 1;
} else {
  console.log(`OK: ${listed.size} archivos en caché, versión ${version}.`);
}

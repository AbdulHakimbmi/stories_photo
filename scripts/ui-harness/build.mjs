// UI test helper: bundles the real game source with a do-nothing stand-in for three.js (see three-stub.js)
// into a folder that the real garden server can serve. Needs the dev tools:  npm i -D esbuild playwright
// Bundles the real game source with the test stub in place of three.js, into a "dist" the real garden server serves.
import * as esbuild from 'esbuild';
import fs from 'node:fs'; import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const PROJECT = path.resolve(HERE, '..', '..');
export async function build(outDir) {
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(PROJECT, 'src/main.js')], bundle: true, format: 'esm', outfile: path.join(outDir, 'assets/app.js'),
    alias: { three: path.join(HERE, 'three-stub.js') }, loader: { '.css': 'css' }, logLevel: 'warning', sourcemap: false,
  });
  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8')
    .replace('<script type="module" src="/src/main.js"></script>', '<link rel="stylesheet" href="/assets/app.css"><script type="module" src="/assets/app.js"></script>');
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}
if (process.argv[1] === new URL(import.meta.url).pathname) { await build(process.argv[2] || '/tmp/e2e-dist'); console.log('built'); }

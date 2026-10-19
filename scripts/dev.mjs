// Development helper:  npm run dev
// Starts the garden server (port 3000) and the Vite dev server (port 5173, hot reload) together.
// Open http://localhost:5173 on the laptop. Phones are sent to the garden server's address (port 3000) by the QR code.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const children = [];

function run(name, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  const tag = `[${name}] `;
  for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) out.write(tag + l + '\n');
    });
  }
  child.on('exit', (code) => {
    console.log(`${tag}stopped (${code ?? 'signal'})`);
    shutdown(code || 0);
  });
  children.push(child);
}

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const c of children) { try { c.kill(); } catch { /* already gone */ } }
  setTimeout(() => process.exit(code), 200);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('server', ['--disable-warning=ExperimentalWarning', path.join(root, 'server', 'index.js')]);
run('game  ', [vite]);
console.log('\n  Open http://localhost:5173 on this computer. Press Ctrl+C to stop both.\n');

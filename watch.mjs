#!/usr/bin/env node
// dev watcher — rebuilds index.html on src/ change.
// debounces concurrent triggers so a burst of file events runs build only once.
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const BUILD = join(ROOT, 'build.mjs');

let pending = false;
let running = false;

function run() {
  if (running) { pending = true; return; }
  running = true;
  const t0 = Date.now();
  const p = spawn(process.execPath, [BUILD], { stdio: 'inherit' });
  p.on('exit', (code) => {
    running = false;
    const ms = Date.now() - t0;
    console.log(`[watch] ${code === 0 ? 'ok' : 'FAIL'} (${ms}ms)`);
    if (pending) { pending = false; run(); }
  });
}

console.log(`[watch] watching ${SRC}`);
run();

let timer = null;
watch(SRC, { recursive: true }, () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; run(); }, 50);
});

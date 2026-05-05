#!/usr/bin/env node
// concat-build for index.html
// reads src/index.template.html, replaces {{INCLUDE: ...}} / {{INCLUDE_DIR: ...}} markers
// with file contents verbatim, writes to ./index.html.
//
// invariant: src/ tree must reproduce the existing index.html byte-for-byte.
// `node build.mjs --verify` exits 1 on any mismatch.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, 'index.html');
// 사용자 명시 2026-05-05: Cloudflare Workers (wrangler.jsonc assets.directory=./public) 가
// public/ 을 entry 로 잡아 deploy. public/index.html 도 같이 써서 둘 byte-identical 보장.
const OUT_PUBLIC = join(ROOT, 'public', 'index.html');
const TEMPLATE = join(SRC, 'index.template.html');

const args = new Set(process.argv.slice(2));
const VERIFY = args.has('--verify');

function readFile(p) {
  return readFileSync(p, 'utf8');
}

function listFilesRecursive(dir) {
  const out = [];
  const entries = readdirSync(dir).sort();
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}

function expand(path, isDir) {
  const full = join(SRC, path);
  if (!existsSync(full)) {
    throw new Error(`include not found: src/${path}`);
  }
  if (isDir) {
    const files = listFilesRecursive(full);
    return files.map(readFile).join('');
  }
  return readFile(full);
}

function build() {
  if (!existsSync(TEMPLATE)) {
    throw new Error(`template not found: ${relative(ROOT, TEMPLATE)} (Phase 1 not yet started?)`);
  }
  const tpl = readFile(TEMPLATE);
  // marker is replaced by file content verbatim. when marker sits on its own line
  // ({{INCLUDE: foo}}\n), the trailing \n is consumed too — included files carry
  // their own line endings, so without this we'd inject extra blank lines.
  return tpl.replace(
    /\{\{(INCLUDE_DIR|INCLUDE):\s*([^}\s]+)\s*\}\}\n?/g,
    (_, kind, p) => expand(p, kind === 'INCLUDE_DIR')
  );
}

function showFirstDiff(expected, got) {
  let i = 0;
  while (i < expected.length && i < got.length && expected[i] === got[i]) i++;
  const ctx = 80;
  const around = (s) => JSON.stringify(s.slice(Math.max(0, i - 20), i + ctx));
  console.error(`first diff at byte ${i}`);
  console.error(`  expected len ${expected.length}, got len ${got.length}`);
  console.error(`  expected: ${around(expected)}`);
  console.error(`  got:      ${around(got)}`);
}

const out = build();

if (VERIFY) {
  if (!existsSync(OUT)) {
    console.error(`verify: ${relative(ROOT, OUT)} missing`);
    process.exit(1);
  }
  if (!existsSync(OUT_PUBLIC)) {
    console.error(`verify: ${relative(ROOT, OUT_PUBLIC)} missing (Cloudflare deploy entry)`);
    process.exit(1);
  }
  const current = readFile(OUT);
  const currentPublic = readFile(OUT_PUBLIC);
  if (current === out && currentPublic === out) {
    console.log(`verify: OK (${out.length} bytes, root + public byte-identical)`);
    process.exit(0);
  }
  console.error('verify: MISMATCH');
  if (current !== out) {
    console.error(`  ${relative(ROOT, OUT)} differs`);
    showFirstDiff(out, current);
  }
  if (currentPublic !== out) {
    console.error(`  ${relative(ROOT, OUT_PUBLIC)} differs`);
    showFirstDiff(out, currentPublic);
  }
  process.exit(1);
}

writeFileSync(OUT, out);
writeFileSync(OUT_PUBLIC, out);
console.log(`build: wrote ${relative(ROOT, OUT)} + ${relative(ROOT, OUT_PUBLIC)} (${out.length} bytes)`);

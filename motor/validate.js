#!/usr/bin/env node
/**
 * validate.js — Validador del arnés (spine anti-deriva).
 *
 * Verifica que la estructura del vault respete el contrato de manifest.json:
 * cada proyecto CON código y ya cableado debe tener index.md, log.md y protocolo-codear-*.md
 * (con frontmatter YAML), y estar mencionado en el registro maestro.
 *
 * Falla ruidosamente (exit 1) si algo se rompió. Correr antes de cerrar cada sesión.
 * Uso: node validate.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HARNESS_DIR = __dirname;
const VAULT_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..'); // harness -> _sistema -> _MASTER-CS -> vault
const SKIP_DIRS = new Set(['node_modules', '.git', '.obsidian', 'graphify-out', '_sistema', '.agents', '.claude']);

const C = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', gray: '\x1b[90m', bold: '\x1b[1m', reset: '\x1b[0m' };
const fails = [];
const warns = [];
const oks = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (m) => oks.push(m);

function loadManifest() {
  const p = path.join(HARNESS_DIR, 'manifest.json');
  if (!fs.existsSync(p)) { console.error('FATAL: no existe manifest.json'); process.exit(2); }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error('FATAL: manifest.json inválido: ' + e.message); process.exit(2); }
}

/** Lista recursiva de archivos .md bajo dir (evita carpetas pesadas), profundidad acotada. */
function findMd(dir, depth = 0, acc = []) {
  if (depth > 4 || !fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const sub = path.join(dir, entry.name);
      // Código que vive DENTRO de un cerebro conserva su propio repo git: no es andamiaje del
      // arnés. Saltar cualquier subrepo (tiene .git) para no confundir su AGENTS.md/index.md
      // con los artefactos obligatorios del cerebro.
      if (fs.existsSync(path.join(sub, '.git'))) continue;
      findMd(sub, depth + 1, acc);
    } else if (entry.name.toLowerCase().endsWith('.md')) {
      acc.push({ name: entry.name, path: path.join(dir, entry.name) });
    }
  }
  return acc;
}

function hasFrontmatter(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return /^\s*---\s*\r?\n/.test(txt);
  } catch { return false; }
}

function main() {
  const m = loadManifest();
  console.log(`${C.bold}=== VALIDADOR DEL ARNÉS — __ORG__ ===${C.reset}`);
  console.log(`${C.gray}Vault: ${VAULT_ROOT}${C.reset}\n`);

  // 1. Fuente canónica y registro
  const canonical = path.join(VAULT_ROOT, m.canonical || 'AGENTS.md');
  fs.existsSync(canonical) ? ok(`canónico presente: ${m.canonical}`) : fail(`FALTA la fuente canónica: ${m.canonical}`);

  const registryPath = path.join(VAULT_ROOT, m.registry || '');
  let registryTxt = '';
  if (m.registry && fs.existsSync(registryPath)) { ok(`registro presente: ${m.registry}`); registryTxt = fs.readFileSync(registryPath, 'utf8'); }
  else fail(`FALTA el registro maestro: ${m.registry}`);

  // 2. Por proyecto
  const req = m.requiredArtifacts || {};
  for (const proj of (m.projects || [])) {
    const cerebroDir = path.join(VAULT_ROOT, proj.cerebro || '');
    const tag = `${proj.name} [${proj.id}]`;

    if (!proj.cerebro || !fs.existsSync(cerebroDir)) { fail(`${tag}: no existe la carpeta-cerebro "${proj.cerebro}"`); continue; }

    // mención en el registro
    if (registryTxt && !(registryTxt.includes(proj.cerebro) || registryTxt.toLowerCase().includes(proj.id))) {
      warn(`${tag}: no aparece en el registro maestro`);
    }

    if (!proj.cabled) { warn(`${tag}: pendiente de cablear (bucket ${proj.bucket})`); continue; }

    // proyecto cableado: exigir artefactos
    const md = findMd(cerebroDir);
    for (const key of Object.keys(req)) {
      const rule = req[key];
      const re = new RegExp(rule.match);
      const found = md.filter(f => re.test(f.name));
      if (found.length === 0) { fail(`${tag}: FALTA ${rule.label}`); continue; }
      const noFm = found.filter(f => m.frontmatterRequired && !hasFrontmatter(f.path));
      if (noFm.length) fail(`${tag}: ${rule.label} sin frontmatter YAML (${noFm.map(f => f.name).join(', ')})`);
      else ok(`${tag}: ${rule.label} ✓`);
    }
  }

  // 3. Reporte
  console.log(`${C.green}PASS (${oks.length})${C.reset}`);
  oks.forEach(m2 => console.log(`  ${C.green}✓${C.reset} ${m2}`));
  if (warns.length) { console.log(`\n${C.yellow}WARN (${warns.length})${C.reset}`); warns.forEach(m2 => console.log(`  ${C.yellow}!${C.reset} ${m2}`)); }
  if (fails.length) { console.log(`\n${C.red}FAIL (${fails.length})${C.reset}`); fails.forEach(m2 => console.log(`  ${C.red}✗${C.reset} ${m2}`)); }

  console.log('');
  if (fails.length) { console.log(`${C.red}${C.bold}ARNÉS ROTO — ${fails.length} fallo(s). La sesión NO está cerrada.${C.reset}`); process.exit(1); }
  console.log(`${C.green}${C.bold}ARNÉS OK${C.reset}${warns.length ? ` (${warns.length} aviso[s])` : ''}.`);
  process.exit(0);
}

main();

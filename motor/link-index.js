#!/usr/bin/env node
/**
 * link-index.js — Conecta el grafo (estilo karpathy).
 *
 * Para cada proyecto del manifest: enlaza TODAS sus notas a su index.md (sub-hub),
 * dentro de una sección auto-gestionada. Como cada index.md apunta a [[AGENTS]],
 * el grafo queda AGRUPADO por proyecto y CONVERGIENDO al centro (AGENTS).
 *
 * Idempotente: regenera solo la sección entre marcadores. No toca el resto del index.
 * Uso: node link-index.js        (o vía harness-check en el futuro)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HARNESS_DIR = __dirname;
const VAULT_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..');
const SKIP = new Set(['node_modules', '.git', '.obsidian', 'graphify-out', '_sistema', '.agents', '.claude', '_archive', '_backup-manual-pre-rebuild']);
const START = '<!-- AUTO-NOTAS:START -->';
const END = '<!-- AUTO-NOTAS:END -->';

const m = JSON.parse(fs.readFileSync(path.join(HARNESS_DIR, 'manifest.json'), 'utf8'));

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      const sub = path.join(dir, e.name);
      if (fs.existsSync(path.join(sub, '.git'))) continue; // subrepo (código dentro del cerebro) → no es nota del arnés
      walk(sub, acc);
    }
    else if (e.name.toLowerCase().endsWith('.md')) acc.push(path.join(dir, e.name));
  }
  return acc;
}
const vaultRel = p => path.relative(VAULT_ROOT, p).split(path.sep).join('/');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

let total = 0;
for (const proj of (m.projects || [])) {
  const dir = path.join(VAULT_ROOT, proj.cerebro || '');
  const idx = path.join(dir, 'index.md');
  if (!fs.existsSync(idx)) { console.log(`(sin index) ${proj.cerebro}`); continue; }

  const notes = walk(dir).filter(f => path.basename(f).toLowerCase() !== 'index.md');
  const links = notes.map(f => {
    const rel = vaultRel(f).replace(/\.md$/i, '');
    const name = path.basename(f).replace(/\.md$/i, '');
    return `- [[${rel}|${name}]]`;
  });

  let txt = fs.readFileSync(idx, 'utf8');
  const re = new RegExp(esc(START) + '[\\s\\S]*?' + esc(END));
  const section = notes.length
    ? `${START}\n## Notas del proyecto (auto · ${notes.length})\n\n> Enlaces generados por el arnés para conectar el grafo. Todas apuntan a este index → [[AGENTS]].\n\n${links.join('\n')}\n${END}`
    : `${START}\n<!-- (aún sin notas en el vault; el código vive fuera) -->\n${END}`;

  txt = re.test(txt) ? txt.replace(re, section) : txt.trimEnd() + '\n\n' + section + '\n';
  fs.writeFileSync(idx, txt, 'utf8');
  total += notes.length;
  console.log(`${proj.cerebro}: ${notes.length} notas enlazadas`);
}
console.log(`\nTOTAL: ${total} enlaces en ${(m.projects || []).length} proyectos → convergen a AGENTS.`);

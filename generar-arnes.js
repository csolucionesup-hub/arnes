#!/usr/bin/env node
/**
 * generar-arnes.js — El generador del arnés (el corazón de la skill).
 *
 * Dado un config (dueño + proyectos + carpeta raíz), scaffoldea un vault-arnés COMPLETO que pasa el
 * validador: constitución (AGENTS.md), contrato (manifest.json), motor (validate/auditar/link-index),
 * registro, harness-check.ps1, punteros por modelo y un cerebro por proyecto (index/log/protocolo/
 * guardián). El motor se copia tal cual (probado) y se LOCALIZA al nuevo dueño.
 *
 * Uso:  node generar-arnes.js <config.json> <carpeta-destino>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SKILL_DIR = __dirname;
const [, , configArg, outArg] = process.argv;
if (!configArg || !outArg) {
  console.error('Uso: node generar-arnes.js <config.json> <carpeta-destino>');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(configArg, 'utf8'));
const OUT = path.resolve(outArg);
const META = cfg.metaFolder || '_SISTEMA';
const OWNER = cfg.owner || 'el dueño';
const ORG = cfg.ownerOrg || OWNER;
const KEY = cfg.key || 'CAMBIA-ESTA-CLAVE';
const REGISTRY = cfg.registry || `${META}/registro-proyectos.md`;
const DATE = new Date().toISOString().slice(0, 10);
const projects = cfg.projects || [];
if (!projects.length) { console.error('El config no tiene proyectos.'); process.exit(1); }

const tpl = (name) => fs.readFileSync(path.join(SKILL_DIR, 'plantillas', name), 'utf8');
const fill = (s, map) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in map ? map[k] : `{{${k}}}`));
const write = (rel, content) => {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log(`  + ${rel}`);
};

console.log(`Generando arnés para "${OWNER}" en ${OUT}\n`);

// 1. Contrato máquina (manifest.json)
const manifest = {
  _comment: `Contrato máquina del arnés de ${OWNER}. Editar SOLO con su aprobación (Ley 1 de AGENTS.md).`,
  canonical: 'AGENTS.md',
  registry: REGISTRY,
  requiredArtifacts: {
    index: { match: '^index\\.md$', label: 'index.md (catálogo)' },
    log: { match: '^log\\.md$', label: 'log.md (bitácora append-only)' },
    protocolo: { match: '^protocolo-codear-.*\\.md$', label: 'protocolo-codear-*.md' },
    guardian: { match: '^AGENTS\\.md$', label: 'AGENTS.md (guardián de entrada / candado de ubicación)' }
  },
  frontmatterRequired: true,
  agents: ['claude', 'codex', 'gemini'],
  agentPointers: { claude: 'CLAUDE.md', codex: 'CODEX.md', gemini: 'GEMINI.md' },
  projects: projects.map(p => ({
    id: p.id, name: p.name, cabled: true, cerebro: p.cerebro,
    aliases: p.aliases || [],
    code: { type: p.codeType || 'repo', path: p.codePath || p.cerebro }
  }))
};
write(`${META}/_sistema/harness/manifest.json`, JSON.stringify(manifest, null, 2));

// 2. Config del policía (audit-config.json)
const auditCfg = {
  _comment: 'Config del policía (auditar.js). Aditivo, NO es el contrato. Se puede afinar sin aprobación.',
  windowHours: 26,
  knownNonProjectRoots: ['_AGENTES', META],
  knownLooseRootFiles: ['AGENTS.md', 'CLAUDE.md', 'CODEX.md', 'GEMINI.md', 'harness-check.ps1',
    'abrir-sesion.ps1', 'cerrar-sesion.ps1', 'resolver-solicitud.ps1', 'EMPIEZA-AQUI.md', '.gitignore'],
  containers: [],
  skipDirs: ['node_modules', '.git', '.obsidian', 'graphify-out', '_sistema', '.agents', '.claude', 'dist'],
  externalAreas: []
};
write(`${META}/_sistema/harness/audit-config.json`, JSON.stringify(auditCfg, null, 2));

// 3. Motor (copiado tal cual, LOCALIZADO al nuevo dueño — solo toca strings/comentarios)
const localize = (s) => s
  .replace(/__ORG__/g, ORG)
  .replace(/__OWNER__/g, OWNER)
  .replace(/__METAHARNESS__/g, `${META}/_sistema/harness`)
  .replace(/__META__/g, META);
for (const f of ['validate.js', 'auditar.js', 'link-index.js', 'resolver-solicitud.js']) {
  write(`${META}/_sistema/harness/${f}`, localize(fs.readFileSync(path.join(SKILL_DIR, 'motor', f), 'utf8')));
}
// Wrapper .ps1 del resolver (clasifica una petición → proyecto/foco; lo usa el candado de foco).
write('resolver-solicitud.ps1', [
  'param([Parameter(Mandatory = $true)][string]$Texto)',
  "$ErrorActionPreference = 'Stop'",
  '$vault = Split-Path -Parent $MyInvocation.MyCommand.Path',
  "$script = Join-Path $vault '" + META + "\\_sistema\\harness\\resolver-solicitud.js'",
  'node $script $Texto',
  'exit $LASTEXITCODE'
].join('\n') + '\n');

// 4. Constitución (AGENTS.md) + punteros por modelo
const wikilinks = projects.map(p => `[[${p.cerebro}/index|${p.name}]]`).join(' · ');
write('AGENTS.md', fill(tpl('AGENTS.md.tpl'), { OWNER, KEY, METAFOLDER: META, REGISTRY, PROJECTS_WIKILINKS: wikilinks }));
for (const file of Object.values(manifest.agentPointers)) {
  write(file, `# ${file} — Puntero\n\n> Este vault usa \`AGENTS.md\` como fuente única de verdad.\n> Lee **[AGENTS.md](AGENTS.md)** y sigue esa constitución. No se duplican reglas aquí.\n`);
}

// 5. Registro maestro
const table = ['| id | proyecto | cerebro |', '|---|---|---|',
  ...projects.map(p => `| \`${p.id}\` | ${p.name} | \`${p.cerebro}\` |`)].join('\n');
write(REGISTRY, fill(tpl('registro.md.tpl'), { METAFOLDER: META, PROJECTS_TABLE: table }));

// 6. Validador de raíz
write('harness-check.ps1', fill(tpl('harness-check.ps1.tpl'), { METAFOLDER: META }));

// 7. Un cerebro por proyecto (index/log/protocolo/guardián)
for (const p of projects) {
  const map = { ID: p.id, NAME: p.name, CEREBRO: p.cerebro, DATE };
  write(`${p.cerebro}/index.md`, fill(tpl('cerebro/index.md.tpl'), map));
  write(`${p.cerebro}/log.md`, fill(tpl('cerebro/log.md.tpl'), map));
  write(`${p.cerebro}/protocolo-codear-${p.id}.md`, fill(tpl('cerebro/protocolo-codear.md.tpl'), map));
  write(`${p.cerebro}/AGENTS.md`, fill(tpl('cerebro/AGENTS.md.tpl'), map));

  // Taxonomía interna LIGERA, por tipo: contenido/agencia nace con 00/02/03; código queda flat.
  // (Estándar auditado: solo los proyectos de contenido usan esta estructura; el código apunta a su repo.)
  const quiereTaxonomia = p.taxonomy === 'light' || p.taxonomy === 'full' ||
    (p.taxonomy == null && /agencia|contenido/i.test(p.codeType || ''));
  if (quiereTaxonomia) {
    const taxo = [
      ['00 Contexto', 'El "qué es esto": cliente, marca, estrategia, conocimiento de fondo. Se lee PRIMERO al entrar. Convención de archivos: prefijo `ctx-`.'],
      ['02 Trabajo', 'Los entregables y el trabajo en curso. Aquí vive el "hacer".'],
      ['03 Bitacora', 'El diario fechado: qué se hizo y cuándo, una entrada por sesión. Junto con `log.md`, es donde "la última vez" queda escrita. Convención: prefijo `btc-` + fecha.'],
    ];
    for (const [dir, desc] of taxo) write(`${p.cerebro}/${dir}/README.md`, `# ${dir}\n\n${desc}\n`);
  }
}

// 8. Helpers de sesión (candado de foco + freno pre-commit Nivel 3)
for (const h of ['abrir-sesion.ps1', 'cerrar-sesion.ps1']) {
  write(h, fill(tpl(`${h}.tpl`), { METAFOLDER: META, KEY, OWNER }));
}

// 9. Grafo bonito de Obsidian (GRATIS: nodos de colores por proyecto + hilos tenues)
const PALETTE = ['#4FC3F7', '#FF7043', '#66BB6A', '#FFD54F', '#BA68C8', '#F06292', '#4DD0E1', '#FFB74D', '#AED581', '#7986CB', '#E57373', '#4DB6AC', '#FFF176', '#90A4AE'];
const colorGroups = projects.map((p, i) => ({
  query: `path:"${p.cerebro}"`,
  color: { a: 1, rgb: parseInt(PALETTE[i % PALETTE.length].slice(1), 16) }
}));
// Excluir del índice/grafo de Obsidian el código que viva DENTRO de un cerebro (code.path como
// subcarpeta, p.ej. _WEB-TIENDA/codigo): si no, Obsidian indexa su node_modules e inunda el grafo.
const codeInsideDirs = [...new Set(projects
  .map(p => (p.codePath || p.cerebro || '').replace(/\\/g, '/'))
  .filter(cp => cp.includes('/') && !cp.startsWith('//') && !/^[A-Za-z]:/.test(cp))
  .map(cp => cp.replace(/\/+$/, '') + '/'))];
write('.obsidian/app.json', JSON.stringify({ userIgnoreFilters: codeInsideDirs }, null, 2) + '\n');
write('.obsidian/appearance.json', JSON.stringify({ theme: 'obsidian', enabledCssSnippets: ['grafo-hermoso'] }, null, 2));
write('.obsidian/core-plugins.json', JSON.stringify({
  'file-explorer': true, 'global-search': true, switcher: true, graph: true, backlink: true,
  'outgoing-link': true, 'tag-pane': true, properties: true, 'page-preview': true, templates: true,
  'command-palette': true, outline: true, bookmarks: true
}, null, 2));
write('.obsidian/graph.json', JSON.stringify({
  'collapse-filter': false,
  search: `-path:_sistema -path:graphify-out -path:${META} `,
  showTags: false, showAttachments: false, hideUnresolved: false, showOrphans: false,
  'collapse-color-groups': false, colorGroups,
  'collapse-display': false, showArrow: true,
  textFadeMultiplier: 0, nodeSizeMultiplier: 1.35, lineSizeMultiplier: 0.7,
  'collapse-forces': false, centerStrength: 0.4, repelStrength: 15, linkStrength: 0.8, linkDistance: 220,
  scale: 0.5, close: true
}, null, 2));
write('.obsidian/snippets/grafo-hermoso.css', tpl('grafo-hermoso.css.tpl'));

// 10. .gitignore (higiene git desde el día 1)
write('.gitignore', fill(tpl('gitignore.tpl'), { METAFOLDER: META }));

// 11. EMPIEZA-AQUI (orientación turnkey para quien recibe el vault)
const projList = projects.map(p => `- **${p.name}** (\`${p.id}\`) → carpeta \`${p.cerebro}/\``).join('\n');
write('EMPIEZA-AQUI.md', fill(tpl('EMPIEZA-AQUI-vault.md.tpl'), { OWNER, PROJECTS_LIST: projList }));

console.log(`\n✅ Listo. ${projects.length} proyecto(s). Tu arnés está en ${OUT}`);
console.log('Siguiente:');
console.log(`  1. Abre EMPIEZA-AQUI.md (te orienta paso a paso).`);
console.log(`  2. (opcional) cd al vault, "git init", y ".\\harness-check.ps1" -> debe decir "ARNÉS OK".`);
console.log(`  3. (opcional) abre la carpeta con Obsidian para ver el grafo de colores.`);

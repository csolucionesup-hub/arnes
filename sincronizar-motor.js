#!/usr/bin/env node
/**
 * sincronizar-motor.js — Refresca el motor del skill (motor/) desde el motor VIVO del vault.
 *
 * El skill lleva copias del motor (validate/auditar/link-index) para ser auto-contenido. Cuando el
 * motor vivo evoluciona (un candado nuevo, un fix), esas copias quedan stale. Este script las
 * refresca COPIANDO + RE-TOKENIZANDO: el motor vivo trae los datos reales del dueño de ese vault
 * (nombre, org, clave de foco); aquí se reemplazan por los tokens genéricos del skill para que el
 * regalo NUNCA arrastre datos de nadie.
 *
 * El mapa de tokenización vive en un archivo LOCAL gitignorado (`sync-tokens.local.json`) — así este
 * script (que SÍ se publica) queda genérico y no expone los datos del dueño. Ver ese archivo de
 * ejemplo o el README para su formato.
 *
 * Uso: node sincronizar-motor.js [ruta-al-motor-vivo]
 */
'use strict';
const fs = require('fs');
const path = require('path');

// El repo-regalo standalone es la fuente canónica; el motor vivo vive en el vault hermano.
// Se prueban varias ubicaciones para que funcione tanto desde el regalo como desde el vault.
const CANDIDATES = [
  process.argv[2],
  path.resolve(__dirname, '..', 'vault-creer-soluciones', '_MASTER-CS', '_sistema', 'harness'),
  path.resolve(__dirname, '..', 'harness'), // legacy: correr desde skill-arnes dentro del vault
].filter(Boolean);
const HARNESS = CANDIDATES.find(p => fs.existsSync(p));
const MOTOR = path.join(__dirname, 'motor');
const FILES = ['validate.js', 'auditar.js', 'link-index.js'];

// Mapa de tokenización desde el archivo LOCAL (no versionado): pares [regex, reemplazo] + leakCheck.
const TOKENS_FILE = path.join(__dirname, 'sync-tokens.local.json');
if (!fs.existsSync(TOKENS_FILE)) {
  console.error(`Falta el mapa local de tokenización: ${TOKENS_FILE}\n` +
    'Créalo (gitignorado) con los datos reales del vault de origen. Formato:\n' +
    '  { "map": [["Nombre Real", "__OWNER__"], ["TU-CLAVE", "<TU-CLAVE-DE-FOCO>"]], "leakCheck": "Nombre Real|TU-CLAVE" }');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
const TOKENS = (cfg.map || []).map(([pat, rep]) => [new RegExp(pat, 'g'), rep]);
const LEAK = cfg.leakCheck ? new RegExp(cfg.leakCheck) : null;

function tokenize(text) {
  let out = text, applied = [];
  for (const [re, tok] of TOKENS) {
    if (re.test(out)) { applied.push(tok); out = out.replace(re, tok); }
  }
  return { out, applied };
}

if (!HARNESS) {
  console.error('No encuentro el motor vivo. Probé:\n' + CANDIDATES.map(p => '  - ' + p).join('\n') +
    '\nPasa la ruta como argumento: node sincronizar-motor.js <ruta-al-motor-vivo>');
  process.exit(1);
}
console.log(`Motor vivo: ${HARNESS}\n`);

let n = 0, leaks = 0;
for (const f of FILES) {
  const src = path.join(HARNESS, f);
  if (!fs.existsSync(src)) { console.log(`  (falta ${f} en el motor vivo — omito)`); continue; }
  const { out, applied } = tokenize(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(path.join(MOTOR, f), out);
  console.log(`  motor/${f}  <-  ${f}${applied.length ? '  [tokens: ' + [...new Set(applied)].join(', ') + ']' : ''}`);
  // Verificación de fuga: ningún dato del dueño debe sobrevivir en la copia genérica.
  if (LEAK && LEAK.test(out)) { console.log(`    ⚠️  FUGA: aún queda un dato del dueño en ${f}`); leaks++; }
  n++;
}
console.log(`\n${n} archivo(s) sincronizados y re-tokenizados.` + (leaks ? ` ⚠️ ${leaks} con fuga — revisar.` : ' Sin fugas.'));
console.log('Revisa el diff y commitea el skill.');

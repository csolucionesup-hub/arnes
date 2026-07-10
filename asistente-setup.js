#!/usr/bin/env node
/**
 * asistente-setup.js — Asistente interactivo para armar el arnés SIN IA.
 * Hace preguntas simples, deriva ids/carpetas de los nombres, y llama al generador.
 * Uso: node asistente-setup.js
 */
'use strict';
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

// Cola de líneas: robusta con teclado (TTY) Y con input redirigido (pipe/archivo).
const rl = readline.createInterface({ input: process.stdin });
const _buf = [];
const _wait = [];
let _closed = false;
rl.on('line', l => { const w = _wait.shift(); if (w) w(l); else _buf.push(l); });
rl.on('close', () => { _closed = true; while (_wait.length) _wait.shift()(''); });
const nextLine = () => new Promise(res => {
  if (_buf.length) return res(_buf.shift());
  if (_closed) return res('');
  _wait.push(res);
});
const ask = async q => { process.stdout.write(q); return String(await nextLine()).trim(); };

// nombre -> id kebab (sin acentos ni símbolos); y -> carpeta-cerebro "_NOMBRE"
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const cerebroOf = s => '_' + slug(s).toUpperCase();

(async () => {
  console.log('\n=== Asistente para armar tu arnés ===');
  console.log('Responde y presiona Enter. (Enter vacío usa el valor por defecto entre [ ].)\n');

  const owner = (await ask('Tu nombre [Dueño]: ')) || 'Dueño';
  const ownerOrg = await ask('Tu organización (opcional): ');
  const key = (await ask('Una palabra clave secreta (para candar tu trabajo) [CAMBIA-ESTA-CLAVE]: ')) || 'CAMBIA-ESTA-CLAVE';

  console.log('\nAhora tus proyectos. Escribe el NOMBRE de cada uno. Enter vacío para terminar.');
  const projects = [];
  while (true) {
    const name = await ask(`  Proyecto ${projects.length + 1} (vacío = listo): `);
    if (!name) break;
    const id = slug(name);
    if (!id) { console.log('    (nombre inválido, intenta otro)'); continue; }
    if (projects.some(p => p.id === id)) { console.log('    (ya lo agregaste, lo salto)'); continue; }
    projects.push({ id, name, cerebro: cerebroOf(name), codeType: 'repo', codePath: cerebroOf(name) });
    console.log(`    ✓ ${name}  ->  id "${id}", carpeta "${cerebroOf(name)}"`);
  }
  if (!projects.length) { console.log('\nSin proyectos, no hay nada que armar. Vuelve cuando tengas alguno.'); rl.close(); return; }

  const defDest = path.join(process.cwd(), 'mi-arnes');
  const dest = (await ask(`\n¿En qué carpeta creo tu arnés? [${defDest}]: `)) || defDest;
  rl.close();

  const cfg = {
    owner, ownerOrg: ownerOrg || owner, key,
    metaFolder: '_SISTEMA', registry: '_SISTEMA/registro-proyectos.md', lang: 'es', projects
  };
  const cfgPath = path.join(__dirname, '.mi-config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

  console.log(`\nResumen: ${owner}${ownerOrg ? ' / ' + ownerOrg : ''} · ${projects.length} proyecto(s)`);
  console.log(`Destino: ${dest}\nGenerando...\n`);
  try {
    cp.execFileSync('node', [path.join(__dirname, 'generar-arnes.js'), cfgPath, dest], { stdio: 'inherit' });
    console.log('\n🎉 Tu arnés está listo. Abre el EMPIEZA-AQUI.md que quedó dentro para orientarte.');
  } finally {
    try { fs.unlinkSync(cfgPath); } catch { /* noop */ }
  }
})();

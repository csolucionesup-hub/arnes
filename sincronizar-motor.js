#!/usr/bin/env node
/**
 * sincronizar-motor.js — Re-copia el motor del arnés VIVO (../harness) a motor/ del skill.
 *
 * El skill lleva copias del motor (validate/auditar/link-index) para ser auto-contenido. Si el motor
 * vivo evoluciona (p. ej. un candado nuevo), esas copias quedan stale. Corre esto para refrescarlas.
 * Luego revisa que sigan GENÉRICAS (sin rutas ni nombres clavados) y commitea.
 *
 * Uso: node sincronizar-motor.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HARNESS = path.resolve(__dirname, '..', 'harness');
const MOTOR = path.join(__dirname, 'motor');
const FILES = ['validate.js', 'auditar.js', 'link-index.js'];

if (!fs.existsSync(HARNESS)) {
  console.error(`No encuentro el motor vivo en ${HARNESS}. Este script corre desde el skill dentro del vault.`);
  process.exit(1);
}

let n = 0;
for (const f of FILES) {
  const src = path.join(HARNESS, f);
  if (!fs.existsSync(src)) { console.log(`  (falta ${f} en ../harness — omito)`); continue; }
  fs.copyFileSync(src, path.join(MOTOR, f));
  console.log(`  motor/${f}  <-  ../harness/${f}`);
  n++;
}
console.log(`\n${n} archivo(s) sincronizados. Revisa que sigan genéricos y commitea el skill.`);

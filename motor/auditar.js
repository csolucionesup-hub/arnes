#!/usr/bin/env node
/**
 * auditar.js — El POLICÍA del arnés (ronda diaria anti-deriva).
 *
 * Complementa a validate.js. validate.js revisa que los proyectos CONOCIDOS
 * tengan sus artefactos; auditar.js caza lo que NO está modelado: carpetas/proyectos
 * nuevos sin registrar, trabajo hecho sin cerrar (sin log / sin commit), y archivos
 * sueltos fuera de todo proyecto: el patrón de deriva que el arnés existe para atajar.
 * Model-neutral: caza el PATRÓN, no a un modelo — juzga igual a cualquiera (Claude, Codex,
 * Gemini, Hermes, DeepSeek). Nadie tiene trato especial, ni de favor ni de sospecha.
 *
 * SOLO-LECTURA sobre el vault: nunca modifica archivos de proyecto.
 * Único efecto de escritura: deja su parte en _sistema/harness/auditorias/AAAA-MM-DD.md.
 * NO ejecuta arreglos: los PROPONE en el parte (decisión de __OWNER__).
 *
 * Uso:  node auditar.js                     (deja el parte y lo imprime)
 *       node auditar.js --stdout            (solo imprime, no escribe archivo)
 *       node auditar.js --registrar-cierre  (opt-in: además sella el cierre en log.md)
 *
 * IMPORTANTE: la ronda diaria (08:00) corre SIN flags → sigue siendo solo-lectura sobre
 * el vault. El sello en log.md es OPT-IN (--registrar-cierre) y lo usa cerrar-sesion.ps1;
 * escribe UNA línea en la propia casa del arnés (_sistema/harness/log.md), nunca en el
 * cerebro de un proyecto.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const HARNESS_DIR = __dirname;
const VAULT_ROOT = path.resolve(HARNESS_DIR, '..', '..', '..');
const ONLY_STDOUT = process.argv.includes('--stdout');
const REGISTRAR_CIERRE = process.argv.includes('--registrar-cierre');
const PRECOMMIT = process.argv.includes('--precommit');
const modeloArg = process.argv.find(a => a.startsWith('--modelo='));
// Identidad model-neutral: cada modelo la declara (--modelo=... o env HARNESS_MODELO).
// Sin default hacia ningún modelo: si nadie declara, el sello lo dice ("modelo-no-declarado")
// — eso es informativo y parejo para todos, no un privilegio para uno.
const MODELO = ((modeloArg ? modeloArg.slice('--modelo='.length) : (process.env.HARNESS_MODELO || '')).trim()) || 'modelo-no-declarado';

// ---- config ----
function loadJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
const cfg = loadJson(path.join(HARNESS_DIR, 'audit-config.json'), {});
const manifest = loadJson(path.join(HARNESS_DIR, 'manifest.json'), null);
if (!manifest) { console.error('FATAL: no pude leer manifest.json'); process.exit(2); }

const WINDOW_MS = (cfg.windowHours || 26) * 3600 * 1000;
const NON_PROJECT_ROOTS = new Set(cfg.knownNonProjectRoots || ['_AGENTES', '_MASTER-CS', '_PROYECTOS-PERSONALES']);
const LOOSE_OK = new Set(cfg.knownLooseRootFiles || []);
const CONTAINERS = cfg.containers || ['_PROYECTOS-PERSONALES'];
const SKIP = new Set(cfg.skipDirs || ['node_modules', '.git', '.obsidian', 'graphify-out', '_sistema', '.agents', '.claude']);
const EXTERNAL = cfg.externalAreas || [];

// carpetas-cerebro y rutas de código declaradas en el manifest
const cerebroDirs = new Set((manifest.projects || []).map(p => p.cerebro).filter(Boolean));
const projByCerebro = new Map((manifest.projects || []).map(p => [p.cerebro, p]));
const projById = new Map((manifest.projects || []).map(p => [p.id, p]));
const declaredCodePaths = (manifest.projects || [])
  .map(p => (p.code && p.code.path) || '')
  .filter(cp => cp && !cp.startsWith('//') && !/^[A-Za-z]:/.test(cp)) // solo rutas relativas dentro del vault
  .map(cp => cp.replace(/\\/g, '/'));

const now = Date.now();
const findings = []; // {sev, tipo, proyecto, msg, fix, pista}
const add = (sev, tipo, msg, fix, extra = {}) => findings.push({ sev, tipo, msg, fix, ...extra });

// Mapeo archivo→proyecto (compartido por detectCommitMezclado y precommitCheck). Un archivo pertenece
// al proyecto cuyo cerebro o code.path relativo es el prefijo MÁS LARGO de su ruta; el andamiaje
// (index/log/agents/protocolo, que link-index reescribe entre proyectos) no define proyecto.
const esAndamiajeName = n => {
  n = String(n).toLowerCase();
  return n === 'log.md' || n === 'index.md' || n === 'agents.md' || /^protocolo-codear-.*\.md$/.test(n);
};
const ownedPrefixes = (manifest.projects || []).map(proj => {
  const prefs = [];
  if (proj.cerebro) prefs.push(proj.cerebro.replace(/\\/g, '/'));
  const cpth = (proj.code && proj.code.path) || '';
  if (cpth && !cpth.startsWith('//') && !/^[A-Za-z]:/.test(cpth)) prefs.push(cpth.replace(/\\/g, '/'));
  return { proj, prefs };
});
const proyectoDeRuta = rel => {
  let best = null, bestLen = -1;
  for (const { proj, prefs } of ownedPrefixes) {
    for (const pre of prefs) {
      if ((rel === pre || rel.startsWith(pre + '/')) && pre.length > bestLen) { bestLen = pre.length; best = proj; }
    }
  }
  return best;
};

// ---- utilidades ----
function listDirs(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); }
  catch { return []; }
}
function listFilesShallow(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name); }
  catch { return []; }
}
/** Recorre archivos (todos, no solo .md) bajo dir, saltando carpetas pesadas. Devuelve {rel, mtime}. */
function walkFiles(dir, base = dir, depth = 0, acc = []) {
  if (depth > 6 || !fs.existsSync(dir)) return acc;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP.has(e.name)) continue;
      walkFiles(path.join(dir, e.name), base, depth + 1, acc);
    } else if (e.isFile()) {
      const full = path.join(dir, e.name);
      let mtime = 0;
      try { mtime = fs.statSync(full).mtimeMs; } catch {}
      acc.push({ rel: path.relative(base, full).replace(/\\/g, '/'), name: e.name, full, mtime });
    }
  }
  return acc;
}
function gitLines(cwd, args) {
  try {
    return cp.execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
  } catch { return null; }
}
// Variante por-argumentos (execFile, SIN shell): necesaria para --pretty=format:%H|%ct|%s, porque
// cmd.exe en Windows manglearía los '%'. execFileSync pasa los args tal cual a git.
function gitArgv(cwd, argv) {
  try {
    return cp.execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
  } catch { return null; }
}
function isRepo(cwd) { return gitLines(cwd, 'rev-parse --is-inside-work-tree') !== null; }

// Conjunto de rutas (relativas al vault) con cambios reales en git. Se usa para NO confundir
// "trabajo sin registrar" con archivos que git solo tocó por normalización de fin de línea
// (CRLF) — esos ya están committeados y limpios. Cacheado: git status no cambia durante la ronda.
let _dirtySet = null;
function gitDirtySet() {
  if (_dirtySet) return _dirtySet;
  _dirtySet = new Set();
  if (!isRepo(VAULT_ROOT)) return _dirtySet;
  for (const line of (gitLines(VAULT_ROOT, 'status --porcelain') || [])) {
    _dirtySet.add(line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/'));
  }
  return _dirtySet;
}

// ================= DETECCIONES =================

// A) Carpetas nuevas en la raíz que no son proyecto ni contenedor conocido → posible proyecto no registrado
function detectRootDrift() {
  for (const d of listDirs(VAULT_ROOT)) {
    if (d.startsWith('.') || SKIP.has(d)) continue;
    if (cerebroDirs.has(d) || NON_PROJECT_ROOTS.has(d)) continue;
    add('ALTA', 'CARPETA_RAIZ_NO_REGISTRADA',
      `Carpeta nueva en la raíz del vault no está en el manifest ni es contenedor conocido: "${d}"`,
      `Decidir con __OWNER__: ¿es un proyecto nuevo? → cablearlo (index/log/protocolo/guardián + entrada en manifest.json y en el registro). ¿Es ruido? → mover/borrar. Nunca dejarlo suelto (patrón de deriva).`,
      { proyecto: d });
  }
}

// B) Archivos sueltos en la raíz no reconocidos
function detectLooseRootFiles() {
  for (const f of listFilesShallow(VAULT_ROOT)) {
    if (LOOSE_OK.has(f)) continue;
    if (f.startsWith('.')) continue;
    add('BAJA', 'ARCHIVO_SUELTO_RAIZ',
      `Archivo suelto en la raíz del vault no reconocido: "${f}"`,
      `Ubicarlo dentro del proyecto que corresponda, o añadirlo a knownLooseRootFiles si es legítimo del sistema.`,
      { proyecto: '(raíz)' });
  }
}

// C) Subcarpetas dentro de contenedores que no están mapeadas por ningún proyecto (patrón de "entierro": un proyecto escondido en un contenedor sin cablear)
function detectBuriedInContainers() {
  for (const c of CONTAINERS) {
    const cdir = path.join(VAULT_ROOT, c);
    for (const sub of listDirs(cdir)) {
      const relDeep = `${c}/${sub}`.replace(/\\/g, '/');
      // ¿alguna ruta de código declarada cae dentro de esta subcarpeta?
      const mapped = declaredCodePaths.some(cp => cp === relDeep || cp.startsWith(relDeep + '/'));
      if (mapped) continue;
      // ¿parece un proyecto? (tiene código o proceso propio y varios archivos)
      const files = walkFiles(path.join(cdir, sub));
      const looksProject = files.some(f => /PROCESO_INMUTABLE|README\.md$|package\.json$|\.py$|\.ps1$|\.js$/i.test(f.name));
      if (!looksProject) continue;
      const recientes = files.filter(f => now - f.mtime < WINDOW_MS).length;
      add(recientes ? 'MEDIA' : 'INFO', 'SUBCARPETA_NO_MAPEADA',
        `Subcarpeta con pinta de proyecto dentro del contenedor "${c}" NO está mapeada al manifest: "${relDeep}" (${files.length} archivos${recientes ? `, ${recientes} tocados en la ventana` : ''})`,
        `Revisar con __OWNER__: ¿es el código de un proyecto ya cableado (mapear su code.path) o un proyecto no registrado que debe cablearse o jubilarse? Es el patrón de "entierro" (proyecto sin cablear escondido en un contenedor).`,
        { proyecto: relDeep });
    }
  }
}

// D) validate.js: artefactos faltantes en proyectos cableados (reusa el candado existente)
function detectMissingArtifacts() {
  try {
    cp.execSync(`node "${path.join(HARNESS_DIR, 'validate.js')}"`, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    const fails = out.split(/\r?\n/).filter(l => /✗|FALTA|sin frontmatter/.test(l)).map(l => l.replace(/\x1b\[[0-9;]*m/g, '').trim());
    for (const l of fails) {
      add('ALTA', 'ARTEFACTO_FALTANTE',
        `validate.js reporta: ${l}`,
        `Un modelo dejó un proyecto cableado sin su artefacto obligatorio. Crear/reparar el artefacto y correr harness-check hasta exit 0.`,
        { proyecto: '(ver línea)' });
    }
  }
}

// E) Trabajo sin registrar: proyecto con archivos tocados en la ventana pero log.md NO tocado
function detectWorkWithoutLog() {
  for (const proj of (manifest.projects || [])) {
    const cdir = path.join(VAULT_ROOT, proj.cerebro || '');
    if (!proj.cerebro || !fs.existsSync(cdir)) continue;
    const files = walkFiles(cdir);
    const recientes = files.filter(f => now - f.mtime < WINDOW_MS);
    if (!recientes.length) continue;
    // El andamiaje del arnés (index/AGENTS/protocolo/log) lo reescribe link-index al cerrar;
    // no cuenta como "trabajo sin registrar". Solo el CONTENIDO/código real dispara el aviso.
    const esAndamiaje = f => {
      const n = f.name.toLowerCase();
      return n === 'log.md' || n === 'index.md' || n === 'agents.md' || /^protocolo-codear-.*\.md$/.test(n);
    };
    const contenido = recientes.filter(f => !esAndamiaje(f));
    if (!contenido.length) continue;
    // Cruce con git: si el vault es repo, solo cuenta el contenido con CAMBIOS REALES sin commitear.
    // Un archivo committeado y limpio ya se registró/cerró aunque git le haya bumpeado el mtime
    // (normalización CRLF) → no es "trabajo sin registrar". Sin git, se conserva el heurístico por mtime.
    const esRepo = isRepo(VAULT_ROOT);
    const dirty = esRepo ? gitDirtySet() : null;
    const contenidoReal = esRepo
      ? contenido.filter(f => dirty.has(path.relative(VAULT_ROOT, f.full).replace(/\\/g, '/')))
      : contenido;
    if (!contenidoReal.length) continue;
    const log = files.find(f => f.name.toLowerCase() === 'log.md');
    const logTocado = log && (now - log.mtime < WINDOW_MS);
    if (!logTocado) {
      const ejemplos = contenidoReal.slice(0, 4).map(f => f.rel);
      add('MEDIA', 'TRABAJO_SIN_REGISTRAR',
        `${proj.name} [${proj.id}]: ${contenidoReal.length} archivo(s) de contenido con cambios sin commitear en las últimas ${cfg.windowHours || 26}h pero log.md NO fue actualizado. Ej.: ${ejemplos.join(', ')}`,
        `Alguien trabajó sin cerrar sesión. Registrar el avance en ${proj.cerebro}/log.md (append-only, lo nuevo arriba) y correr el protocolo de cierre.`,
        { proyecto: proj.id });
    }
  }
}

// F) Git del vault: trabajo sin commitear, agrupado por proyecto (sesión sin cerrar)
function detectUncommitted() {
  if (!isRepo(VAULT_ROOT)) return;
  const st = gitLines(VAULT_ROOT, 'status --porcelain') || [];
  if (!st.length) return;
  const porProyecto = new Map();
  for (const line of st) {
    const p = line.slice(3).replace(/^"|"$/g, '');
    const parts = p.split('/');
    // archivo suelto en la raíz (sin carpeta) → un solo bucket "(raíz)"; carpetas de sistema → ignorar
    let top = parts.length > 1 ? parts[0] : '(raíz)';
    if (top !== '(raíz)' && (SKIP.has(top) || top.startsWith('.'))) continue;
    if (!porProyecto.has(top)) porProyecto.set(top, []);
    porProyecto.get(top).push(p);
  }
  for (const [top, arch] of porProyecto) {
    const proj = projByCerebro.get(top);
    const nombre = proj ? `${proj.name} [${proj.id}]` : top;
    add('MEDIA', 'SESION_SIN_CERRAR',
      `${nombre}: ${arch.length} cambio(s) sin commitear en git → sesión sin cerrar.`,
      `Cerrar la sesión del proyecto: registrar en log.md → link-index → harness-check → graphify → commit (con permiso de __OWNER__). Los .html/.pdf/.png que no van a git deberían estar en .gitignore.`,
      { proyecto: proj ? proj.id : top });
  }
}

// G) Actividad reciente por proyecto (informativo, no es hallazgo — alimenta el análisis)
function actividadReciente() {
  const filas = [];
  for (const proj of (manifest.projects || [])) {
    const cdir = path.join(VAULT_ROOT, proj.cerebro || '');
    if (!proj.cerebro || !fs.existsSync(cdir)) continue;
    const n = walkFiles(cdir).filter(f => now - f.mtime < WINDOW_MS).length;
    if (n) filas.push({ id: proj.id, name: proj.name, n });
  }
  return filas.sort((a, b) => b.n - a.n);
}

// H) Externo: estado de repos/áreas fuera del vault (bot, etc.)
function detectExternal() {
  const notas = [];
  for (const ext of EXTERNAL) {
    const dir = path.resolve(VAULT_ROOT, ext.path);
    if (!fs.existsSync(dir)) { notas.push(`- ${ext.label}: ruta no encontrada (${ext.path})`); continue; }
    if (isRepo(dir)) {
      const st = gitLines(dir, 'status --porcelain') || [];
      if (st.length) {
        notas.push(`- ${ext.label}: ${st.length} cambio(s) sin commitear.`);
        add('MEDIA', 'EXTERNO_SIN_CERRAR',
          `${ext.label}: ${st.length} cambio(s) sin commitear (fuera del vault).`,
          `El candado de esta área NO es harness-check sino "${ext.guard || 'su propio test'}". Correr ese guard y cerrar/commitear con permiso.`,
          { proyecto: ext.id });
      } else { notas.push(`- ${ext.label}: git limpio.`); }
    } else {
      const recientes = walkFiles(dir).filter(f => now - f.mtime < WINDOW_MS).length;
      notas.push(`- ${ext.label}: no es repo git; ${recientes} archivo(s) tocados en la ventana.`);
    }
  }
  return notas;
}

// I) Guardián desactualizado: un guardián de contenedor describe a un proyecto como "pendiente de
// cablear / fuera del arnés" cuando en el manifest YA está cableado (cabled:true). harness-check
// verifica que el guardián EXISTA, no que su TEXTO concuerde con el contrato → este cruce cierra ese
// hueco. Model-neutral: hallazgo original de Codex (auditoría 2026-07-05), aquí vuelto mecánico.
function detectStaleGuardians() {
  const STALE = /pendiente de cablear|fuera del arn[eé]s|sin cablear|por cablear|no[- ]cableado/g;
  // tokens que identifican a cada proyecto CABLEADO. El cerebro siempre (es único). El basename del
  // code.path solo si es DISTINTIVO: no compartido por otro proyecto (p. ej. "_sistema" lo usan varias
  // agencias) ni genérico. Así no se atribuye una frase stale al proyecto equivocado por substring.
  const projs = (manifest.projects || []).filter(p => p.cabled);
  const baseOf = p => {
    const cp = (p.code && p.code.path) || '';
    return cp ? cp.replace(/\\/g, '/').split('/').filter(Boolean).pop().toLowerCase() : '';
  };
  const baseCount = {};
  for (const p of projs) { const b = baseOf(p); if (b) baseCount[b] = (baseCount[b] || 0) + 1; }
  const GENERIC = new Set(['_sistema', 'sistema', 'dist', 'src', 'web', 'app', 'code']);
  const projTokens = projs.map(p => {
    const toks = [p.cerebro.toLowerCase()];
    const b = baseOf(p);
    if (b && baseCount[b] === 1 && !GENERIC.has(b)) toks.push(b);
    return { p, toks };
  });
  // Parte el texto en UNIDADES lógicas (filas de tabla, bullets con su envoltura indentada). Así una
  // frase stale se atribuye solo a proyectos mencionados en LA MISMA unidad — sin sangrar entre filas.
  const splitUnits = text => {
    const units = [];
    let cur = null;
    for (const ln of text.split(/\r?\n/)) {
      if (/^\s*$/.test(ln)) { if (cur !== null) { units.push(cur); cur = null; } continue; }
      if (/^\s*([-*+]|\d+\.|\||#|>)/.test(ln) || cur === null) { if (cur !== null) units.push(cur); cur = ln; }
      else { cur += ' ' + ln; } // línea de prosa indentada = continuación del ítem anterior
    }
    if (cur !== null) units.push(cur);
    return units;
  };
  for (const c of CONTAINERS) {
    const cdir = path.join(VAULT_ROOT, c);
    const guardians = walkFiles(cdir).filter(f => f.name.toLowerCase() === 'agents.md');
    for (const g of guardians) {
      let text = '';
      try { text = fs.readFileSync(g.full, 'utf8'); } catch { continue; }
      const relG = path.relative(VAULT_ROOT, g.full).replace(/\\/g, '/');
      const body = text.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''); // ignora el frontmatter (metadata, no la guía)
      const seen = new Set();
      for (const unit of splitUnits(body)) {
        const u = unit.replace(/\s+/g, ' ').toLowerCase();
        STALE.lastIndex = 0;
        const m = STALE.exec(u);
        if (!m) continue;
        const sIni = m.index, sFin = sIni + m[0].length;
        // dentro de la unidad, el proyecto cableado cuyo token está MÁS CERCA de la frase stale
        let best = null, bestD = Infinity;
        for (const { p, toks } of projTokens) {
          for (const tok of toks) {
            let from = 0, ti;
            while ((ti = u.indexOf(tok, from)) !== -1) {
              const d = ti < sIni ? sIni - (ti + tok.length) : ti - sFin;
              if (d >= 0 && d < bestD) { bestD = d; best = p; }
              from = ti + tok.length;
            }
          }
        }
        if (best && !seen.has(best.id)) {
          seen.add(best.id);
          add('MEDIA', 'GUARDIAN_DESACTUALIZADO',
            `El guardián "${relG}" describe a "${best.name} [${best.id}]" como pendiente/fuera del arnés, pero en el manifest YA está cableado (cabled:true, cerebro ${best.cerebro}). Confunde a un modelo que arranque en esa carpeta.`,
            `Actualizar el texto del guardián para reflejar el contrato: ${best.id} está cableado; su cerebro es ${best.cerebro}. (harness-check no valida la semántica del guardián — por eso este cruce lo hace el policía.)`,
            { proyecto: best.id });
        }
      }
    }
  }
}

// J) Foco de sesión: si hay una sesión abierta (candado de foco, ver AGENTS.md), TODO el trabajo
// debe ir a su proyecto. Si en la ventana se tocó CONTENIDO real de OTRO proyecto, es exactamente el
// error que el candado existe para atajar (guardar en el proyecto equivocado). Sin sesión abierta
// (proyecto=null o archivo ausente), no aplica → no estorba a quien no use el candado.
function detectFueraDeFoco() {
  const ses = loadJson(path.join(HARNESS_DIR, 'sesion-activa.json'), null);
  if (!ses || !ses.proyecto) return;
  const foco = projById.get(ses.proyecto);
  const focoCerebro = (ses.cerebro || (foco && foco.cerebro) || '').toString();
  const esAndamiaje = f => {
    const n = f.name.toLowerCase();
    return n === 'log.md' || n === 'index.md' || n === 'agents.md' || /^protocolo-codear-.*\.md$/.test(n);
  };
  const esRepo = isRepo(VAULT_ROOT);
  const dirty = esRepo ? gitDirtySet() : null;
  for (const proj of (manifest.projects || [])) {
    if (!proj.cerebro || proj.cerebro === focoCerebro) continue;
    const cdir = path.join(VAULT_ROOT, proj.cerebro);
    if (!fs.existsSync(cdir)) continue;
    const recientes = walkFiles(cdir).filter(f => now - f.mtime < WINDOW_MS && !esAndamiaje(f));
    const reales = esRepo
      ? recientes.filter(f => dirty.has(path.relative(VAULT_ROOT, f.full).replace(/\\/g, '/')))
      : recientes;
    if (!reales.length) continue;
    const ej = reales.slice(0, 4).map(f => f.rel);
    add('MEDIA', 'TRABAJO_FUERA_DE_FOCO',
      `La sesión está en foco "${ses.proyecto}" (${focoCerebro}) pero se tocó CONTENIDO de otro proyecto: "${proj.name} [${proj.id}]" (${reales.length} archivo(s): ${ej.join(', ')}).`,
      `Candado de foco: con una sesión abierta, todo va a "${ses.proyecto}". Si de verdad cambiaste de proyecto, hazlo con la clave: .\\abrir-sesion.ps1 -Proyecto ${proj.id} -Clave <TU-CLAVE-DE-FOCO> (registra/cierra el anterior primero). Si fue un error, mueve ese trabajo a "${ses.proyecto}" o descártalo.`,
      { proyecto: proj.id });
  }
}

// K) Commit mezclado: un solo commit que toca CONTENIDO real de más de un proyecto. El cierre debe
// ser ATÓMICO — un commit cierra UN proyecto (candado de foco, AGENTS.md Ley 9). Error típico: `git
// add -A` al cerrar barre trabajo suelto de OTRO proyecto (sesión previa sin commitear) dentro del
// commit del proyecto en foco. detectFueraDeFoco solo mira con sesión ABIERTA; este cruce mira los
// commits YA sellados en la ventana → atrapa el patrón aunque no se declarara sesión. Andamiaje
// (index/log/agents/protocolo, que link-index reescribe entre proyectos al cerrar) y archivos de
// sistema (grafo, .obsidian, _sistema…) NO cuentan: solo el CONTENIDO real define proyecto.
function detectCommitMezclado() {
  if (!isRepo(VAULT_ROOT)) return;
  // Mapeo archivo→proyecto: usa los helpers de módulo (esAndamiajeName / proyectoDeRuta).
  const commits = gitArgv(VAULT_ROOT, ['log', '-n', '80', '--no-merges', '--pretty=format:%H|%ct|%s']) || [];
  for (const line of commits) {
    const i1 = line.indexOf('|'); if (i1 < 0) continue;
    const i2 = line.indexOf('|', i1 + 1); if (i2 < 0) continue;
    const sha = line.slice(0, i1);
    const ct = Number(line.slice(i1 + 1, i2)) * 1000;
    const subject = line.slice(i2 + 1);
    if (!(ct >= now - WINDOW_MS)) continue; // solo commits dentro de la ventana
    const files = gitArgv(VAULT_ROOT, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', sha]) || [];
    const porProy = new Map(); // id -> {name, ej:[]}
    for (let f of files) {
      f = f.replace(/^"|"$/g, '').replace(/\\/g, '/');
      if (esAndamiajeName(f.split('/').pop())) continue;
      const proj = proyectoDeRuta(f);
      if (!proj) continue; // sistema/grafo/contenedor → no es contenido de proyecto
      if (!porProy.has(proj.id)) porProy.set(proj.id, { name: proj.name, ej: [] });
      const b = porProy.get(proj.id); if (b.ej.length < 2) b.ej.push(f);
    }
    if (porProy.size < 2) continue;
    const detalle = [...porProy.entries()].map(([id, v]) => `${v.name} [${id}] (ej.: ${v.ej.join(', ')})`).join(' · ');
    add('MEDIA', 'COMMIT_MEZCLADO',
      `El commit ${sha.slice(0, 7)} ("${subject}") mezcla ${porProy.size} proyectos en un solo commit: ${detalle}. Un commit debe cerrar UN proyecto (candado de foco, AGENTS.md Ley 9).`,
      `Al cerrar, el commit lleva SOLO archivos del proyecto en foco: revisa 'git status' y usa 'git add <rutas-del-proyecto>', nunca 'git add -A' / 'git add .' a ciegas. Si arrastraste trabajo suelto de otro proyecto, sepáralo (ese proyecto se cierra en su propia sesión).`,
      { proyecto: [...porProy.keys()].join(' + ') });
  }
}

// Chequeo PRE-COMMIT (Nivel 3): mira el árbol de trabajo (git status), no los commits. Si el trabajo
// SIN COMMITEAR es de más de un proyecto, avisa y sale 1 → cerrar-sesion.ps1 lo usa para NO dejar que
// `git add -A` selle un commit mezclado. Impide el error en el momento (COMMIT_MEZCLADO lo caza después;
// esto lo previene antes). Andamiaje y archivos de sistema no cuentan (mismo criterio que el candado).
function precommitCheck() {
  if (!isRepo(VAULT_ROOT)) { console.log('Pre-commit: no es repo git; nada que revisar.'); return 0; }
  const st = gitLines(VAULT_ROOT, 'status --porcelain') || [];
  const porProy = new Map();
  for (const line of st) {
    const p = line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/');
    if (esAndamiajeName(p.split('/').pop())) continue;
    const proj = proyectoDeRuta(p);
    if (!proj) continue;
    if (!porProy.has(proj.id)) porProy.set(proj.id, { name: proj.name, ej: [] });
    const b = porProy.get(proj.id); if (b.ej.length < 3) b.ej.push(p);
  }
  if (porProy.size < 2) {
    console.log(`Pre-commit OK: trabajo sin commitear de ${porProy.size} proyecto(s). Commit atomico posible.`);
    return 0;
  }
  console.log(`PRE-COMMIT: COMMIT MEZCLADO EN CAMINO - hay trabajo sin commitear de ${porProy.size} proyectos:`);
  for (const [id, v] of porProy) {
    console.log(`  - ${v.name} [${id}]: ${v.ej.join(', ')}${v.ej.length >= 3 ? ' ...' : ''}`);
  }
  console.log('Un commit = un proyecto (AGENTS.md Ley 9). Commitea cada uno por separado: git add <rutas-del-proyecto>, no `git add -A`.');
  return 1;
}

// ================= REPORTE =================
function pad2(n) { return String(n).padStart(2, '0'); }
function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localStamp() {
  const d = new Date();
  return `${localDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function buildReport() {
  detectRootDrift();
  detectLooseRootFiles();
  detectBuriedInContainers();
  detectMissingArtifacts();
  detectWorkWithoutLog();
  detectUncommitted();
  detectStaleGuardians();
  detectFueraDeFoco();
  detectCommitMezclado();
  const externas = detectExternal();
  const actividad = actividadReciente();

  const orden = { ALTA: 0, MEDIA: 1, BAJA: 2, INFO: 3 };
  findings.sort((a, b) => (orden[a.sev] - orden[b.sev]));
  const cnt = sev => findings.filter(f => f.sev === sev).length;
  const emoji = { ALTA: '🔴', MEDIA: '🟠', BAJA: '🟡', INFO: '🔵' };

  let veredicto;
  if (cnt('ALTA')) veredicto = '🚨 DERIVA — hay proyectos/carpetas fuera del modelo. Requiere decisión.';
  else if (cnt('MEDIA')) veredicto = '⚠️ AVISOS — trabajo sin cerrar o sin registrar. Revisar.';
  else if (findings.length) veredicto = '🟡 MENOR — solo detalles de higiene.';
  else veredicto = '✅ TODO ALINEADO — nadie se salió del carril en la ventana auditada.';

  const L = [];
  L.push('---');
  L.push('tipo: auditoria');
  L.push('ambito: arnes');
  L.push(`fecha: ${localDate()}`);
  L.push(`descripcion: Ronda del policía del arnés — ${localStamp()}. Ventana ${cfg.windowHours || 26}h.`);
  L.push('---');
  L.push('');
  L.push(`# Parte de la ronda — ${localStamp()}`);
  L.push('');
  L.push(`**Veredicto:** ${veredicto}`);
  L.push('');
  L.push(`**Conteo:** 🔴 ${cnt('ALTA')} alta · 🟠 ${cnt('MEDIA')} media · 🟡 ${cnt('BAJA')} baja · 🔵 ${cnt('INFO')} info`);
  L.push('');
  L.push('> Solo-lectura. Los arreglos se **proponen**, no se ejecutan (decisión de __OWNER__). Análisis con __OWNER__ después.');
  L.push('');

  if (findings.length) {
    L.push('## Hallazgos');
    L.push('');
    let i = 1;
    for (const f of findings) {
      L.push(`### ${i}. ${emoji[f.sev]} [${f.sev}] ${f.tipo}${f.proyecto ? ` — ${f.proyecto}` : ''}`);
      L.push('');
      L.push(`**Qué vi:** ${f.msg}`);
      L.push('');
      L.push(`**Fix propuesto:** ${f.fix}`);
      L.push('');
      i++;
    }
  } else {
    L.push('## Hallazgos');
    L.push('');
    L.push('Ninguno. El arnés está limpio en esta ventana.');
    L.push('');
  }

  L.push('## Actividad reciente por proyecto (informativo)');
  L.push('');
  if (actividad.length) {
    L.push('| Proyecto | Archivos tocados |');
    L.push('|---|---|');
    for (const a of actividad) L.push(`| ${a.name} [${a.id}] | ${a.n} |`);
  } else {
    L.push('Sin actividad en la ventana.');
  }
  L.push('');

  L.push('## Áreas externas (fuera del vault)');
  L.push('');
  L.push(externas.length ? externas.join('\n') : '- (ninguna configurada)');
  L.push('');

  L.push('---');
  L.push(`_Generado por \`auditar.js\` (el policía del arnés). No modifica proyectos; solo deja este parte._`);

  const html = buildHtml({ veredicto, cnt, findings, actividad, externas, stamp: localStamp(), emoji });
  return { texto: L.join('\n'), html, veredicto, cnt, findings };
}

// ---- versión HTML (para que el bot la pase a PDF con Puppeteer y la mande a Telegram) ----
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function buildHtml({ veredicto, cnt, findings, actividad, externas, stamp, emoji }) {
  const color = { ALTA: '#d6336c', MEDIA: '#e8590c', BAJA: '#f08c00', INFO: '#1c7ed6' };
  const cards = findings.length ? findings.map((f, i) => `
    <div class="card ${f.sev}">
      <div class="cardhead"><span class="sev" style="background:${color[f.sev]}">${emoji[f.sev]} ${f.sev}</span>
        <span class="tipo">${esc(f.tipo)}</span>${f.proyecto ? `<span class="proy">${esc(f.proyecto)}</span>` : ''}</div>
      <p><b>Qué vi:</b> ${esc(f.msg)}</p>
      <p class="fix"><b>Fix propuesto:</b> ${esc(f.fix)}</p>
    </div>`).join('') : '<p class="ok">Ninguno. El arnés está limpio en esta ventana.</p>';

  const filasAct = actividad.length
    ? actividad.map(a => `<tr><td>${esc(a.name)} <span class="id">[${esc(a.id)}]</span></td><td class="num">${a.n}</td></tr>`).join('')
    : '<tr><td colspan="2">Sin actividad en la ventana.</td></tr>';

  const ext = (externas && externas.length ? externas : ['- (ninguna configurada)'])
    .map(l => `<li>${esc(l.replace(/^- /, ''))}</li>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ronda del policía del arnés — ${esc(stamp)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1a1a1a; margin: 0; line-height: 1.5; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 8px 4px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .stamp { color: #777; font-size: 13px; margin-bottom: 14px; }
  .veredicto { font-size: 16px; font-weight: 700; padding: 12px 14px; border-radius: 10px; background: #f1f3f5; border-left: 6px solid #495057; margin-bottom: 10px; }
  .conteo { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .chip { font-size: 13px; font-weight: 700; color: #fff; padding: 4px 10px; border-radius: 20px; }
  .nota { color: #666; font-size: 12px; font-style: italic; margin: 8px 0 18px; }
  h2 { font-size: 16px; border-bottom: 2px solid #e9ecef; padding-bottom: 4px; margin: 22px 0 12px; }
  .card { border: 1px solid #e9ecef; border-left: 5px solid #adb5bd; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; page-break-inside: avoid; }
  .card.ALTA { border-left-color: ${color.ALTA}; } .card.MEDIA { border-left-color: ${color.MEDIA}; }
  .card.BAJA { border-left-color: ${color.BAJA}; } .card.INFO { border-left-color: ${color.INFO}; }
  .cardhead { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
  .sev { color: #fff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; }
  .tipo { font-family: ui-monospace, "Courier New", monospace; font-size: 12px; color: #495057; }
  .proy { font-size: 12px; background: #f1f3f5; padding: 2px 8px; border-radius: 6px; color: #212529; }
  .card p { margin: 4px 0; font-size: 13.5px; }
  .fix { color: #2b6a2f; } .ok { color: #2b6a2f; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { color: #666; font-size: 12px; text-transform: uppercase; }
  td.num { text-align: right; font-weight: 700; } .id { color: #999; font-size: 11px; }
  ul { margin: 6px 0; padding-left: 18px; font-size: 13px; }
  .foot { color: #999; font-size: 11px; margin-top: 22px; border-top: 1px solid #eee; padding-top: 8px; }
</style></head><body><div class="wrap">
  <h1>🚔 Ronda del policía del arnés</h1>
  <div class="stamp">${esc(stamp)} · ventana ${cfg.windowHours || 26}h · __ORG__</div>
  <div class="veredicto">${esc(veredicto)}</div>
  <div class="conteo">
    <span class="chip" style="background:${color.ALTA}">🔴 ${cnt('ALTA')} alta</span>
    <span class="chip" style="background:${color.MEDIA}">🟠 ${cnt('MEDIA')} media</span>
    <span class="chip" style="background:${color.BAJA}">🟡 ${cnt('BAJA')} baja</span>
    <span class="chip" style="background:${color.INFO}">🔵 ${cnt('INFO')} info</span>
  </div>
  <div class="nota">Solo-lectura. Los arreglos se proponen, no se ejecutan. Análisis con __OWNER__ después.</div>
  <h2>Hallazgos</h2>
  ${cards}
  <h2>Actividad reciente por proyecto</h2>
  <table><thead><tr><th>Proyecto</th><th class="num">Archivos tocados</th></tr></thead><tbody>${filasAct}</tbody></table>
  <h2>Áreas externas (fuera del vault)</h2>
  <ul>${ext}</ul>
  <div class="foot">Generado por auditar.js — el policía del arnés. No modifica proyectos; solo deja este parte.</div>
</div></body></html>`;
}

// ---- auto-registro en el log del arnés (OPT-IN, solo con --registrar-cierre) ----
// Añade UNA línea de sello al tope de _sistema/harness/log.md. Append-only, lo nuevo arriba.
// Escribe en la propia casa del arnés (junto a auditorias/), nunca en el cerebro de un proyecto;
// por eso NO viola el invariante "solo-lectura sobre los proyectos". La ronda diaria no lo llama.
function registrarCierreEnLog({ veredicto, cnt }) {
  const logPath = path.join(HARNESS_DIR, 'log.md');
  let raw;
  try { raw = fs.readFileSync(logPath, 'utf8'); }
  catch { console.log('AVISO: no pude leer log.md del arnés; no registré el sello de cierre.'); return; }

  const vCorto = String(veredicto).split('—')[0].trim();
  const conteo = `${cnt('ALTA')} alta / ${cnt('MEDIA')} media`;
  const parteRel = `auditorias/${localDate()}.md`;
  const linea = `- [ronda] ${localDate()} — ${MODELO} — Cierre de sesión: policía ${vCorto} (${conteo} · ${cnt('BAJA')} baja · ${cnt('INFO')} info). Parte: ${parteRel}`;

  const lines = raw.split('\n');
  const idx = lines.findIndex(l => /^- \[/.test(l)); // primera entrada = tope de la bitácora
  if (idx === -1) { console.log('AVISO: no hallé dónde insertar en log.md; no registré el sello.'); return; }

  // Guarda anti-duplicado: si la entrada más nueva ya es un sello [ronda] de hoy con el mismo
  // conteo (p. ej. se corrió el cierre dos veces seguidas), no dupliques.
  const top = lines[idx];
  if (/^- \[ronda\]/.test(top) && top.includes(localDate()) && top.includes(`(${conteo} ·`)) {
    console.log('Sello de cierre de hoy ya presente con el mismo estado; no dupliqué.');
    return;
  }

  lines.splice(idx, 0, linea);
  fs.writeFileSync(logPath, lines.join('\n'), 'utf8');
  console.log(`Sello de cierre registrado en ${path.relative(VAULT_ROOT, logPath).replace(/\\/g, '/')}`);
}

function main() {
  if (PRECOMMIT) { process.exit(precommitCheck()); }
  const r = buildReport();
  if (!ONLY_STDOUT) {
    const dir = path.join(HARNESS_DIR, 'auditorias');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const file = path.join(dir, `${localDate()}.md`);
    fs.writeFileSync(file, r.texto, 'utf8');
    const htmlFile = path.join(dir, `${localDate()}.html`);
    fs.writeFileSync(htmlFile, r.html, 'utf8');
    console.log(`Parte guardado en: ${path.relative(VAULT_ROOT, file).replace(/\\/g, '/')} (+ .html)`);
  }
  if (REGISTRAR_CIERRE) registrarCierreEnLog({ veredicto: r.veredicto, cnt: r.cnt });
  console.log('');
  if (REGISTRAR_CIERRE) {
    // Modo cierre: salida compacta (el parte completo queda en auditorias/).
    console.log(`Policía: ${r.veredicto}`);
    console.log(`Conteo: 🔴 ${r.cnt('ALTA')} alta · 🟠 ${r.cnt('MEDIA')} media · 🟡 ${r.cnt('BAJA')} baja · 🔵 ${r.cnt('INFO')} info`);
  } else {
    console.log(r.texto);
  }
  // Código de salida por severidad: 0 limpio/menor, 1 avisos (media), 2 deriva (alta) — para que la tarea programada lo distinga.
  const code = r.cnt('ALTA') ? 2 : (r.cnt('MEDIA') ? 1 : 0);
  process.exit(code);
}

main();

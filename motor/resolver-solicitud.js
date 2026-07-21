#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HARNESS = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(HARNESS, 'manifest.json'), 'utf8'));
const sesPath = path.join(HARNESS, 'sesion-activa.json');

function norm(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreProject(text, project) {
  const haystack = ` ${norm(text)} `;
  const terms = [project.id, project.name, ...(project.aliases || []), ...(project.intentSignals || [])]
    .map(norm).filter(Boolean);
  let score = 0;
  const matches = [];
  for (const term of terms) {
    if (haystack.includes(` ${term} `) || haystack.includes(term)) {
      const weight = (project.intentSignals || []).map(norm).includes(term) ? 4 : 3;
      score += weight;
      matches.push(term);
    }
  }
  return { project, score, matches };
}

function resolve(text, session) {
  const normalized = norm(text);
  const governance = manifest.governance || {
    id: 'harness-governance',
    cerebro: '__METAHARNESS__',
    aliases: []
  };
  const governanceTerms = [
    'harness', 'arnes', 'manifest', 'candado de foco', 'sesion activa',
    ...(governance.aliases || [])
  ];
  const governanceMatches = governanceTerms.filter(t => normalized.includes(norm(t)));
  if (governanceMatches.length) {
    const active = session?.proyecto || null;
    return {
      proposedProject: governance.id,
      brain: governance.cerebro,
      confidence: 'high',
      matches: governanceMatches,
      activeProject: active,
      action: !active ? 'CONFIRMAR_GOBERNANZA' : active === governance.id ? 'CONTINUAR' : 'DETENER_Y_CAMBIAR_FOCO'
    };
  }

  const ranked = manifest.projects.map(p => scoreProject(text, p)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const tied = ranked.filter(r => r.score === best.score && r.score > 0);
  if (!best || best.score === 0 || tied.length > 1) {
    return {
      proposedProject: null,
      brain: null,
      confidence: 'low',
      matches: [],
      activeProject: session?.proyecto || null,
      action: 'PREGUNTAR_PROYECTO'
    };
  }

  const active = session?.proyecto || null;
  return {
    proposedProject: best.project.id,
    brain: best.project.cerebro,
    confidence: best.score >= 4 ? 'high' : 'medium',
    matches: best.matches,
    activeProject: active,
    action: !active ? 'CONFIRMAR_PROYECTO' : active === best.project.id ? 'CONTINUAR' : 'DETENER_Y_CAMBIAR_FOCO'
  };
}

function loadSession() {
  try { return JSON.parse(fs.readFileSync(sesPath, 'utf8')); } catch { return null; }
}

if (require.main === module) {
  const text = process.argv.slice(2).join(' ').trim();
  if (!text) {
    process.stderr.write('Uso: node resolver-solicitud.js "<peticion>"\n');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(resolve(text, loadSession()), null, 2)}\n`);
}

module.exports = { resolve, norm };

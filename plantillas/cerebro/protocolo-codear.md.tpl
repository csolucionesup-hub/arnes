---
proyecto: {{ID}}
tipo: protocolo
tags: [{{ID}}, protocolo]
---

# Cómo codear en {{NAME}}

> Protocolo local. La ley global es [[AGENTS]]; esto la aterriza a **{{NAME}}**.

1. Lee el cerebro: [[{{CEREBRO}}/index|index]] → [[{{CEREBRO}}/log|log]].
2. Reconcilia con el git real del repo (`rama`, `HEAD`, `status`). **El repo manda sobre la nota.**
3. Codea en el repo, nunca en el vault. Registra el avance en `log.md`.
4. Valida: `harness-check.ps1`. Cierra **atómico**: un commit = **{{NAME}}** (candado de foco).

[DATO A CONFIRMAR] Añade aquí los comandos reales del proyecto (build, test, deploy) y su repo.

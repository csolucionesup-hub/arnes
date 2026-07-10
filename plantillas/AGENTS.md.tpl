# AGENTS.md — Constitución del arnés (fuente única de verdad)

> **Este archivo es la ley del sistema.** Lo lee CUALQUIER modelo de IA (Claude, Codex, Gemini,
> Cursor, DeepSeek, local…) antes de trabajar con código en este vault. Los punteros por modelo
> (`CLAUDE.md`, `CODEX.md`, `GEMINI.md`) **solo apuntan aquí** — no repiten reglas. Si un modelo y
> este archivo discrepan, **gana este archivo**.

---

## Principio fundacional (karpathy)

**El vault es el cerebro. Tú (el modelo) eres solo el mantenedor.** La inteligencia vive en los
archivos, no en ti — por eso cualquier modelo puede reemplazarte sin que el sistema pierda nada. Lo
tedioso (llevar el registro al día) lo haces tú; **{{OWNER}}** solo **decide**.

## Modelo de 3 capas

1. **CÓDIGO (raw)** — vive en su repo + git. Es la verdad. Lo editas, no lo inventas.
2. **VAULT (wiki)** — lo mantienes tú: por proyecto → `index.md` + `log.md` + protocolo + guardián.
3. **GRAFO** — indexa la wiki (`link-index.js` conecta las notas al centro; opcional graphify).

Contrato máquina: `{{METAFOLDER}}/_sistema/harness/manifest.json`. Registro: `{{REGISTRY}}`.

---

## Arranque en frío — cualquier modelo

0. **Sabe a quién sirves:** el comandante es **{{OWNER}}**. Él decide; tú mantienes.
1. Lee esta ley (`AGENTS.md`).
2. Lee el `manifest.json` (proyectos, rutas, punteros).
3. Resuelve el proyecto por su `id`/alias.
4. Lee el cerebro del proyecto: `index.md` → `log.md` (últimas entradas).
5. Trabaja siguiendo su `protocolo-codear-*.md`. **El repo manda sobre la nota.**
6. Registra y valida al cerrar: entrada en `log.md` → `harness-check.ps1` (no cierres si falla).

## Regla de entrada — UBÍCATE O DETENTE (candado de ubicación)

Antes de cualquier acción, ubícate: **¿en qué carpeta arranqué? ¿a qué proyecto pertenece? ¿lo que
me piden corresponde a ESTA carpeta?** Si **no** → **PÁRATE. NO lo hagas.** Dile a {{OWNER}} la ruta
correcta (del `manifest.json`). Nunca trabajes "porque ya estás ahí". Cada carpeta lleva un guardián
(`AGENTS.md`) que te trae a esta ley.

## Foco de sesión — UN proyecto a la vez (candado de foco)

1. **Al abrir, DECLARA** el proyecto (si no se sabe, conversa hasta fijarlo).
2. **Durante, no salgas del foco.** Tocar/guardar en otro proyecto exige la clave **`{{KEY}}`**.
3. **Al cerrar,** los avances van **solo** al proyecto en foco. El **commit es ATÓMICO**: un commit =
   un proyecto (nunca `git add -A` a ciegas — arrastra trabajo de otro proyecto).

---

## Leyes no-negociables (anti-deriva)

1. **NO reorganices ni renombres** carpetas/archivos/convenciones. Si algo falta, **propón — no apliques.**
2. **El repo manda sobre la nota.** Si difieren, gana el git → regístralo en el `log.md`.
3. **Registra en `log.md`** (append-only, lo nuevo arriba) cada sesión de código.
4. **NO push / deploy / merge / gasto** sin aprobación explícita de {{OWNER}}.
5. **Marca `[DATO A CONFIRMAR]`** lo que requiera validación humana.
6. **Antes de cerrar, corre el validador** (`harness-check.ps1`). Una sesión no se cierra rota.
7. **UBÍCATE ANTES DE ACTUAR** (candado de ubicación).
8. **UN PROYECTO POR SESIÓN**; el commit de cierre es atómico (un commit = un proyecto).

## Cómo codear bien — el oficio (4 principios)

1. **Piensa antes de codear** — declara supuestos; si hay dudas, PARA y pregunta. No escondas la confusión.
2. **Simplicidad primero** — el código mínimo que resuelve el problema; nada especulativo.
3. **Cambios quirúrgicos** — toca solo lo que debes; respeta el estilo existente; no borres código
   muerto ajeno (menciónalo). Cada línea cambiada debe rastrearse a lo que se pidió.
4. **Meta verificable** — criterio de éxito medible y repetir hasta cumplirlo (test si es código,
   revisión del output si es contenido).

---

## Protocolo de cierre de sesión

1. **Registra** en el `log.md` del proyecto tocado (append-only, lo nuevo arriba).
2. **Actualiza** las notas/`index.md` afectadas. Marca `[DATO A CONFIRMAR]` lo no verificado.
3. **Reconecta el grafo:** `node {{METAFOLDER}}/_sistema/harness/link-index.js`.
4. **Valida:** `harness-check.ps1`. Si FALLA, arréglalo — no se cierra roto.
5. **Commit** (SOLO con permiso de {{OWNER}}) — **atómico**, solo el proyecto en foco.

## Contrato de estructura (lo que exige el validador)

Todo proyecto cableado DEBE tener en su cerebro: `index.md`, `log.md`, `protocolo-codear-*.md` y
`AGENTS.md` (guardián). Todo `.md` del sistema lleva frontmatter YAML (`---`). El validador
(`{{METAFOLDER}}/_sistema/harness/validate.js`) lo verifica y **falla ruidosamente** si algo se rompió.

---

## Mapa vivo

**Comandante:** {{OWNER}}

**Proyectos bajo el arnés (todos al mismo nivel):**
{{PROJECTS_WIKILINKS}}

> Así se lee el grafo: **{{OWNER}} → agentes → AGENTS (este archivo) → proyectos → notas.**

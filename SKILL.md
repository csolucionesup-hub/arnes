---
name: armar-arnes
description: >-
  Arma el "arnés" — un sistema de orden para trabajar con IA sobre varios proyectos: una constitución
  (AGENTS.md) que cualquier modelo lee, un contrato máquina (manifest.json), candados anti-deriva
  (ubicación + foco + commit atómico), un policía que audita, y un cerebro por proyecto
  (index/log/protocolo/guardián). Úsalo cuando alguien quiera ORDEN para dirigir varios proyectos de
  código/contenido con distintos modelos de IA sin que se pierda el hilo. Genera todo con
  generar-arnes.js a partir de un config simple.
---

# Armar el arnés — sistema de orden para trabajar con IA

Este skill instala, para una persona nueva, el mismo sistema de orden que gobierna un vault
multi-proyecto: **la inteligencia vive en los archivos, no en el modelo** (premisa karpathy), así que
cualquier IA (Claude, Codex, Gemini…) puede mantenerlo y ninguna es imprescindible.

## Qué produce

Un vault listo que **pasa el validador**, con:

- **`AGENTS.md`** — la constitución (ley única que todos los modelos leen).
- **`<META>/_sistema/harness/`** — el motor: `manifest.json` (contrato), `audit-config.json`,
  `validate.js` (validador), `auditar.js` (el policía anti-deriva, con candado `COMMIT_MEZCLADO` +
  `--precommit`), `link-index.js` (conecta el grafo).
- **`harness-check.ps1`** — valida la estructura (exit 0 = OK).
- **Helpers de sesión** — `abrir-sesion.ps1` + `cerrar-sesion.ps1` (candado de foco + freno
  pre-commit Nivel 3; graphify opcional se omite solo si no está).
- **Grafo bonito de Obsidian, GRATIS** — `.obsidian/` con paleta de colores por proyecto, modo
  oscuro y CSS de hilos tenues. Abren la carpeta en Obsidian y ya se ve espectacular.
- **Punteros** `CLAUDE.md` / `CODEX.md` / `GEMINI.md` (solo apuntan a `AGENTS.md`).
- **Un cerebro por proyecto** — `index.md` + `log.md` + `protocolo-codear-*.md` + `AGENTS.md`
  (guardián de ubicación).
- **`EMPIEZA-AQUI.md`** + `.gitignore` — orientación turnkey e higiene git desde el día 1.

## Cómo usarlo (lo haces TÚ por el usuario — que él casi no piense)

El usuario dice **"arma mi arnés"**. Lo guías con calidez y haces el trabajo:

1. **Entrevista corta y amable.** Pregúntale, de a poco (una cosa a la vez):
   - Su **nombre** (y su organización, si quiere).
   - Sus **proyectos**: solo el **nombre** de cada uno (ej. *"Mi tienda"*). **TÚ derivas** el `id`
     (kebab) y la carpeta-cerebro (`_NOMBRE`) — no le hagas pensar en eso. Si el código de alguno
     vive en otro lado (WSL, otro repo), pregúntale la ruta; si no, usa la carpeta del cerebro.
     Si el proyecto es de **contenido** (no código), ponle `codeType: "contenido"` → nace con la
     taxonomía ligera `00 Contexto / 02 Trabajo / 03 Bitacora` (cada una con su README). Si es código, queda flat.
   - Una **palabra clave secreta** (candado de foco). Es de él; **no la inventes tú**.
   - **Dónde** crear su arnés (carpeta).
2. **Arma el config** (copia `setup-config.example.json`, llénalo — deriva ids/cerebros de los nombres).
3. **Genera:** `node generar-arnes.js <config.json> <carpeta-destino>`.
4. **Verifica** por él: `cd <destino>` → `git init` → `.\harness-check.ps1` → debe decir **ARNÉS OK**.
5. **Oriéntalo, no lo dejes solo:** dile que abra el `EMPIEZA-AQUI.md` que quedó en su vault,
   ofrécele instalar Obsidian para ver el grafo de colores, y explícale en 2 frases los candados
   (ubícate-o-detente, un-proyecto-por-sesión, commit atómico) y que **él decide, la IA mantiene**.

Si el usuario prefiere no usarte, apúntalo a `node asistente-setup.js` (hace lo mismo con preguntas).

## Reglas al instalar (respeta el propio arnés)

- **Propón, no impongas.** No inventes proyectos ni rutas: pregúntaselas.
- **La clave es del dueño.** Nunca la fijes tú.
- Marca `[DATO A CONFIRMAR]` lo que el dueño deba completar (los `code.path` reales, el "qué es" de
  cada proyecto).
- Extras que dependen de cosas externas (ofrécelos solo si los pide): **graphify semántico**
  (auto-enlace por IA; el grafo nativo de Obsidian ya funciona sin esto) y la **ronda diaria** del
  policía (tarea programada del SO). El grafo visual, los helpers de sesión y el candado de foco YA
  vienen instalados.

## Detalle técnico

Ver `README.md`. El motor se copia **tal cual** del arnés probado y se **localiza** al nuevo dueño
(reemplaza el nombre del autor original en los mensajes). El layout `<META>/_sistema/harness/` respeta
la resolución de raíz del motor (`__dirname` 3 niveles arriba = raíz del vault), por eso funciona sin
tocar el código del motor.

# 👋 Empieza aquí — tu arnés está listo, {{OWNER}}

Este es tu **sistema de orden para trabajar con IA**. La idea, en una frase:

> **Tu conocimiento vive en estos archivos, no en la IA.** Por eso cualquier IA (Claude, Codex,
> Gemini…) puede ayudarte y ninguna es imprescindible. **Tú decides; la IA mantiene el orden.**

## Cómo trabajar (cada vez)

1. Abre esta carpeta con tu IA de código (Claude Code, Cursor…).
2. La IA lee `AGENTS.md` (la ley) y ya sabe cómo trabajar aquí.
3. Trabajas en **un proyecto por sesión**. Al terminar, la IA registra el avance y valida.

> Truco: si no sabes por dónde empezar, dile a tu IA: **"lee AGENTS.md y explícame cómo trabajar aquí"**.

> **Ejemplo:** {{OWNER}} abre la carpeta con Claude Code y dice *"trabajemos en Mi Tienda"*. La IA lee el contexto y la bitácora, ve que ayer quedó a medias el post de enero, y siguen desde ahí. Al terminar, la IA anota en la bitácora *"publiqué el post de enero"* y valida. Mañana, retomar toma segundos.

## Dónde va cada cosa (en tus proyectos de contenido)

Cada proyecto de **contenido** nace con estas carpetas — así nunca dudas dónde guardar algo, y cualquier IA sabe dónde buscar:

| Carpeta | Qué guardas ahí | Ejemplo |
|---|---|---|
| **00 Contexto** | Lo que hay que saber del proyecto: cliente, marca, estrategia | `ctx-mi-tienda.md` |
| **02 Trabajo** | Lo que produces: piezas, borradores, entregables | `campaña-enero/` |
| **03 Bitácora** | Un diario: qué hiciste y cuándo | `btc-2026-07-10-lance-el-blog.md` |

> **La regla de oro:** cuando retomas un proyecto, la IA lee `00 Contexto` (para saber **qué es**) y `03 Bitácora` + `log.md` (para saber **dónde quedaste**). Por eso, si registras lo que haces, la próxima sesión arranca al instante.

*(Los proyectos de **código** no llevan estas carpetas: su trabajo vive en su repo; el cerebro solo lo apunta.)*

## Los candados que te cuidan (ya están activos; no haces nada)

- **Ubícate o detente** — la IA no trabaja en la carpeta equivocada.
- **Un proyecto por sesión** — no se mezcla tu trabajo.
- **Commit atómico** — un guardado = un proyecto.
- **El policía** (`auditar.js`) — revisa que nadie se salga del carril.

## Ver tu "segundo cerebro" bonito (opcional, gratis)

1. Instala [Obsidian](https://obsidian.md) (gratis).
2. Ábrelo → **"Abrir carpeta como almacén (vault)"** → elige ESTA carpeta.
3. Abre la **Vista de Grafo** (ícono de círculos conectados). Verás tus proyectos como
   constelaciones de colores, cada uno con su color.

## Tus proyectos

{{PROJECTS_LIST}}

## Validar que todo está sano

En una terminal **PowerShell**, dentro de esta carpeta:

```
.\harness-check.ps1
```

Debe decir **ARNÉS OK**. Si algo falla, te dice exactamente qué arreglar.

## Abrir y cerrar una sesión de trabajo (opcional, para orden extra)

```
.\abrir-sesion.ps1 -Proyecto <id-del-proyecto>     # fija el foco en un proyecto
.\cerrar-sesion.ps1 -Proyecto <id-del-proyecto>    # valida y deja todo listo para guardar
```

La clave para cambiar de proyecto sin cerrar la tienes tú (la elegiste al crear esto).

---

*Hecho con el arnés — un sistema de orden para trabajar con IA. Que lo disfrutes.*

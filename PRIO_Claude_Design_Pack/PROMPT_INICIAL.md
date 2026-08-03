# Prompt inicial para Claude Design

Copia el texto que está abajo de la línea y pégalo como primer mensaje en claude.ai/design, después de subir las 4 carpetas de este paquete.

---

Hola. Te paso un paquete con todo lo necesario para producir el video Hero de **PRIO**, una app SaaS de productividad multi-tenant. Antes de empezar, lee con calma los siguientes archivos en este orden:

1. `02_conceptos/CLAUDE.md` — mapa completo del proyecto. Te da el contexto de negocio, el modelo de datos y las decisiones de producto.
2. `01_marca/tailwind.config.ts` — la paleta oficial. Los 4 colores de marca son `#4FC38A` (verde), `#F27D72` (coral), `#5BA7D1` (azul) y `#9B7EDC` (púrpura). Tipografía: Plus Jakarta Sans.
3. `01_marca/PrioLogo.tsx` — el logo es una grilla 2x2 de cuadritos redondeados, en el orden verde → coral → azul → púrpura.
4. `02_conceptos/quadrants.ts` y `02_conceptos/spaces.ts` — el modelo mental: 4 cuadrantes (Haz ahora, Planifica, Delega, Después) y 4 espacios (Pendientes, Personal, Familia, Trabajo).
5. `03_pantallas/*` — los 8 componentes React reales que van a aparecer en el video. Respeta su estructura visual.
6. `04_entregables/PRIO_Hero_Video_Brief.docx` — el brief completo con guion escena por escena, voiceover, música y shot list.
7. `04_entregables/PRIO_Hero_Storyboard.html` — la referencia visual exacta de cómo debe verse el video animado.

## Lo que necesito que hagas

Construye una primera versión del video Hero como **prototipo interactivo** dentro de Claude Design, siguiendo las 8 escenas del storyboard HTML. Mantén el timing total entre 45 y 55 segundos. Usa el design system que vas a construir a partir de los archivos de `01_marca`.

El concepto creativo (big idea) está en el brief: el logo de PRIO ya tiene los 4 colores que son los 4 espacios de vida; el video aprovecha eso para narrar visualmente la transición del *caos* del día al *orden* en una sola vista.

## Reglas no negociables

- Los 4 colores de marca con sus hex exactos. Nada de variantes.
- Plus Jakarta Sans, pesos 600 a 800 en headlines, 500 en subtítulos.
- Idioma: español neutral (sin regionalismos).
- Tagline oficial al cierre: *"Tu trabajo, tu casa y lo personal en una sola vista. Prioriza con claridad."*
- Sin stock corporate (handshakes, gente sonriendo), sin gráficos hi-tech.
- Movimiento suave con easing tipo `cubic-bezier(0.22, 1, 0.36, 1)`, stagger de 80–120 ms entre elementos.

## Lo que voy a hacer contigo después

Cuando tengas la primera versión, voy a iterar contigo escena por escena: ajustes de timing, copy on-screen, intensidad de animación. Cuando esté lista, la exportamos como HTML standalone (para grabar la pantalla y agregar la voz en off), o a Canva si la voz en off va a ir adentro de Claude Design.

Avísame cuando hayas leído los archivos y arrancamos con la escena 1.

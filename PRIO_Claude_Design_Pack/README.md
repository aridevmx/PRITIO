# PRIO · Paquete para Claude Design

Este paquete está armado para que **Claude Design** (claude.ai/design) entienda en una sola lectura qué es PRIO, qué se ve en pantalla y cuál es la marca. Está pensado para producir el video Hero y, después, los videos explicativos por feature.

## Cómo usarlo

1. Entra a **https://claude.ai/design** con tu cuenta Pro, Max, Team o Enterprise.
2. Cuando te pida materiales o codebase, sube las 4 carpetas de este paquete (o el ZIP completo).
3. Abre `PROMPT_INICIAL.md` (está al lado de este README), copia el texto entero y pégalo como primer mensaje a Claude Design.
4. Listo: Claude Design va a construir un design system con tus colores y tipografía, y arrancar la primera versión del video Hero.

## Qué hay en cada carpeta

### 01_marca — la identidad visual
Es lo más importante para que el design system salga correcto. Contiene:
- `tailwind.config.ts` — la paleta oficial de PRIO con los 4 colores de marca (#4FC38A verde, #F27D72 coral, #5BA7D1 azul, #9B7EDC púrpura), las sombras, las animaciones y los radios de borde.
- `index.css` — variables CSS para modo claro y modo oscuro.
- `index.html` — el tagline oficial (*"Tu trabajo, tu casa y lo personal en una sola vista. Prioriza con claridad."*) y la carga de Plus Jakarta Sans desde Google Fonts.
- `PrioLogo.tsx` — el componente del logo (grilla 2x2 de cuadritos redondeados, cada uno con su color y un drop-shadow del mismo tono).

### 02_conceptos — el modelo mental del producto
Tres archivos cortos que explican *qué significa cada cosa* en PRIO, con los textos exactos que ya usa la app:
- `quadrants.ts` — los 4 cuadrantes (Haz ahora, Planifica, Delega, Después) con su color y subtítulo.
- `spaces.ts` — los 4 espacios (Pendientes, Personal, Familia, Trabajo) con su descripción.
- `CLAUDE.md` — el mapa completo del proyecto. Si Claude Design solo va a leer un archivo, que lea este. Tiene la arquitectura, el modelo de datos, las convenciones, el glosario y las decisiones de producto.

### 03_pantallas — los componentes reales de la app
Los 8 componentes React/TSX que más se ven en el producto. Sirven para que Claude Design copie la estructura visual real (no inventada) en los mockups del video:
- `QuadrantsView.tsx` — la pantalla principal (matriz 2x2).
- `TaskCard.tsx` — la tarjeta de tarea con chips de responsables.
- `TaskFormDialog.tsx` — el modal de crear/editar tarea.
- `ApprovalsBanner.tsx` — el banner amarillo de tareas pendientes de aprobación.
- `MonthCalendar.tsx` — el calendario mensual con eventos coloreados.
- `NotificationBell.tsx` — la campanita con badge de notificaciones.
- `Sidebar.tsx` y `AppShell.tsx` — la estructura general (sidebar + header).

### 04_entregables — lo que ya está hecho
Los dos archivos que vienen como base del video:
- `PRIO_Hero_Video_Brief.docx` — brief completo con guion escena por escena, voiceover, música, shot list, paleta, tipografía, variantes para redes y checklist de entrega. Claude Design lo puede ingerir directo (acepta DOCX).
- `PRIO_Hero_Storyboard.html` — storyboard HTML interactivo con las 8 escenas animadas y cronometradas. Sirve como referencia visual exacta de cómo debe lucir el video final.

## Reglas no negociables para Claude Design

Estas son las pocas cosas que el video **debe** respetar. Vale la pena que estén también en el prompt inicial:

- **Los 4 colores de marca exactos**: `#4FC38A` verde, `#F27D72` coral, `#5BA7D1` azul, `#9B7EDC` púrpura. Sin variantes "creativas".
- **Tipografía**: Plus Jakarta Sans, pesos 600 a 800 para headlines, 500 para subtítulos.
- **Idioma**: español neutral (sin regionalismos marcados).
- **Tagline oficial al cierre**: *"Tu trabajo, tu casa y lo personal en una sola vista. Prioriza con claridad."*
- **Duración**: 45 a 55 segundos para el master 16:9.
- **No estilos prohibidos**: nada de stock corporate (handshakes, gente sonriendo), nada de gráficos hi-tech con triángulos azules.

## Después del Hero

Cuando termines el Hero, puedes usar este mismo paquete para los videos explicativos. Pídele a Claude Design algo como: *"Con este mismo design system, crea un video explicativo de 30 segundos para la feature de aprobaciones, usando el componente ApprovalsBanner como referencia visual."* — y vas iterando feature por feature.

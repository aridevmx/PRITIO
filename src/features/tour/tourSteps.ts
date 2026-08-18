export interface TourStep {
  id: string;
  target?: string;
  title: string;
  description: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "bienvenida",
    title: "Bienvenido a Pritio",
    description: "Te mostraremos lo esencial en unos segundos. Puedes salir cuando quieras.",
  },
  {
    id: "cuadrantes",
    target: "[data-tour='cuadrantes']",
    title: "Cuadrantes",
    description:
      "Organiza tus tareas por prioridad: Haz ahora, Planifica, Delega y Después (matriz de Eisenhower).",
  },
  {
    id: "nueva-tarea",
    target: "[data-tour='nueva-tarea']",
    title: "Crea tareas al instante",
    description:
      "Usa este botón para agregar una tarea: título, cuadrante, fecha, recordatorios y repetición.",
  },
  {
    id: "vistas",
    target: "[data-tour='vistas']",
    title: "Cambia de vista",
    description:
      "Alterna entre Cuadrantes, Plan, Tablero y Calendario para ver tu trabajo a tu manera.",
  },
  {
    id: "notificaciones",
    target: "[data-tour='notificaciones']",
    title: "Notificaciones",
    description:
      "Aquí verás avisos de tareas asignadas, recordatorios, aprobaciones e invitaciones.",
  },
  {
    id: "menu",
    target: "[data-tour='menu']",
    title: "Tu cuenta",
    description:
      "Desde el menú gestionas tu perfil, preferencias, suscripciones y ajustes del workspace.",
  },
];

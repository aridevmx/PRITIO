import type { ReactNode } from "react";
import { AppIcon } from "@/components/AppIcon";
import { CalendarBlank, Lightning, Tray, Users } from "@phosphor-icons/react";
import type { QuadrantIconKey } from "@/features/tasks/quadrants";

/** Icono de cada cuadrante. Compartido por QuadrantsView, TaskFormDialog y
 *  AddTaskDialog para que el signo sea siempre el mismo. */
export const QUADRANT_ICONS: Record<QuadrantIconKey, ReactNode> = {
  zap: <AppIcon glyph={Lightning} />,
  calendar: <AppIcon glyph={CalendarBlank} />,
  users: <AppIcon glyph={Users} />,
  archive: <AppIcon glyph={Tray} />,
};

import type { Quadrant as QuadrantKey } from "@/types";

export interface QuadrantMeta {
  key: QuadrantKey;
  title: string;
  subtitle: string;
  /** Tailwind class hooks. All literal so JIT can detect them. */
  classes: {
    border: string;
    badge: string;
    accentBg: string;
    accentText: string;
    softBg: string;
    /** Gradient-from class for the accent line under header */
    fromAccent: string;
    /** Classes applied to the column when a task is being dragged over it */
    dropOver: string;
  };
}

export const QUADRANTS: Record<QuadrantKey, QuadrantMeta> = {
  do: {
    key: "do",
    title: "Haz ahora",
    subtitle: "Lo más importante",
    classes: {
      border: "border-prio-coral/30",
      badge: "bg-prio-coral/10 text-prio-coral",
      accentBg: "bg-prio-coral",
      accentText: "text-prio-coral",
      softBg: "bg-prio-coral/5",
      fromAccent: "from-prio-coral/30",
      dropOver: "ring-2 ring-prio-coral/50 bg-prio-coral/5",
    },
  },
  plan: {
    key: "plan",
    title: "Planifica",
    subtitle: "Sin perder control",
    classes: {
      border: "border-prio-blue/30",
      badge: "bg-prio-blue/10 text-prio-blue",
      accentBg: "bg-prio-blue",
      accentText: "text-prio-blue",
      softBg: "bg-prio-blue/5",
      fromAccent: "from-prio-blue/30",
      dropOver: "ring-2 ring-prio-blue/50 bg-prio-blue/5",
    },
  },
  delegate: {
    key: "delegate",
    title: "Delega",
    subtitle: "Asigna con claridad",
    classes: {
      border: "border-prio-green/30",
      badge: "bg-prio-green/10 text-prio-green",
      accentBg: "bg-prio-green",
      accentText: "text-prio-green",
      softBg: "bg-prio-green/5",
      fromAccent: "from-prio-green/30",
      dropOver: "ring-2 ring-prio-green/50 bg-prio-green/5",
    },
  },
  later: {
    key: "later",
    title: "Después",
    subtitle: "No urgente ahora",
    classes: {
      border: "border-prio-purple/30",
      badge: "bg-prio-purple/10 text-prio-purple",
      accentBg: "bg-prio-purple",
      accentText: "text-prio-purple",
      softBg: "bg-prio-purple/5",
      fromAccent: "from-prio-purple/30",
      dropOver: "ring-2 ring-prio-purple/50 bg-prio-purple/5",
    },
  },
};

export const QUADRANT_ORDER: QuadrantKey[] = [
  "do",
  "plan",
  "delegate",
  "later",
];

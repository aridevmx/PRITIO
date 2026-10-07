import { cn } from "@/lib/utils";
import type { Icon as PhosphorIcon, IconProps, IconWeight } from "@phosphor-icons/react";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

/** Phosphor dibuja sobre una grilla de 256. Estos son los tamaños que la
 *  app usa de verdad; nada fuera de la escala. */
const SIZES: Record<IconSize, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
};

export interface AppIconProps extends Omit<IconProps, "size" | "weight"> {
  glyph: PhosphorIcon;
  size?: IconSize;
  /** `bold` es la voz por defecto de la UI: a 16px rinde el mismo trazo de
   *  1.5px que usaba el set dibujado a mano. `fill` para lo activo, `duotone`
   *  para estados vacíos y momentos de producto. */
  weight?: IconWeight;
}

/** Único punto de entrada para iconos. El color lo pone quien lo usa
 *  (`text-ink-muted`, `text-pritio-coral`…) vía className. */
export function AppIcon({
  glyph: Glyph,
  size = "md",
  weight = "bold",
  alt,
  className,
  ...rest
}: AppIconProps) {
  return (
    <Glyph
      size={SIZES[size]}
      weight={weight}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={cn("shrink-0", className)}
      {...rest}
    />
  );
}

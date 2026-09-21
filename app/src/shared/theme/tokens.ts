/**
 * Los colores y medidas del prototipo, en un solo sitio.
 *
 * Dos que no son decorativos y conviene no tocar a la ligera:
 *   · `expiry` y `bestBefore` distinguen caducidad de consumo preferente. Una
 *     es seguridad y la otra calidad, y el proyecto se ha comprometido a que
 *     no se vean igual.
 *   · `touchTarget` es el mínimo legal de accesibilidad para algo pulsable.
 */
export const colors = {
  ground: '#FBF8F3',
  surface: '#FFFFFF',
  border: '#ECE5D8',
  borderStrong: '#C9C0AF',

  ink: '#1C1A17',
  inkMuted: '#6B655C',
  inkFaint: '#8C857A',

  brand: '#2F6B4F',
  brandSoft: '#E6EFE9',

  /** Caducidad: seguridad alimentaria. */
  expiry: '#B23A2B',
  expirySoft: '#FDEEEB',

  /** Consumo preferente: calidad. Deliberadamente neutro. */
  bestBefore: '#6B655C',

  warning: '#8A5A12',
  warningSoft: '#F7EBD8',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 11, lg: 14, pill: 999 } as const;

/** Mínimo de accesibilidad para cualquier cosa pulsable. */
export const touchTarget = 44;

export const font = {
  body: { fontSize: 15, color: colors.ink },
  bodySmall: { fontSize: 13, color: colors.inkMuted },
  caption: { fontSize: 11.5, color: colors.inkFaint },
  title: { fontSize: 28, fontWeight: '600', color: colors.ink, letterSpacing: -0.5 },
  label: { fontSize: 12, color: colors.inkMuted },
} as const;

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';

/**
 * La paleta de Opsi, en claro y en oscuro.
 *
 * Los valores no están elegidos a ojo: `scripts/check-contrast.mjs` calcula el
 * contraste WCAG de cada combinación y falla si alguna baja de 4.5:1 en texto
 * o de 3:1 en controles. Si cambias un color, pasa ese script antes de
 * commitear.
 *
 * El modo oscuro NO es el claro invertido. Dos diferencias deliberadas:
 *   · Los fondos son grises cálidos, no negro puro: el negro absoluto sobre
 *     OLED produce halos en los bordes del texto.
 *   · Los acentos suben de luminosidad, porque un verde oscuro desaparece
 *     sobre un fondo oscuro.
 */
export type Palette = {
  ground: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  brand: string;
  /** Solo decorativo: puntos, iconos grandes, logo. Nunca texto pequeño. */
  brandBright: string;
  brandSoft: string;
  /** Texto sobre `brandSoft`. */
  brandInk: string;
  /** Sobre un relleno de marca. */
  onBrand: string;
  /** Caducidad: seguridad alimentaria. */
  expiry: string;
  expirySoft: string;
  /** Texto sobre `expirySoft`. */
  expiryInk: string;
  /** Borde de una superficie de caducidad. */
  expiryLine: string;
  /** Prioridad media, y todo lo orientativo. */
  warning: string;
  warningSoft: string;
  /** Congelado: la cuenta atrás está parada. */
  frost: string;
  frostSoft: string;
  /** Texto sobre `frostSoft`. `frost` ahí se queda en 3.9:1. */
  frostInk: string;
};

const CLARO: Palette = {
  ground: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEDE7',
  border: '#E3E0D8',
  borderStrong: '#9D947F',
  ink: '#16181A',
  inkMuted: '#5F6470',
  inkFaint: '#717683',
  brand: '#0A7D56',
  brandBright: '#10B981',
  brandSoft: '#DDF5EB',
  brandInk: '#08553A',
  onBrand: '#F6F5F2',
  expiry: '#C23B2B',
  expirySoft: '#FBE8E4',
  expiryInk: '#7E3A2E',
  expiryLine: '#D6664F',
  warning: '#A46718',
  warningSoft: '#FBF0DC',
  frost: '#2A7BB8',
  frostSoft: '#E2F0FA',
  frostInk: '#1D5580',
};

const OSCURO: Palette = {
  ground: '#111316',
  surface: '#1B1E22',
  surfaceAlt: '#23272C',
  border: '#2E3339',
  borderStrong: '#616974',
  ink: '#F2F3F5',
  inkMuted: '#A8AFBA',
  inkFaint: '#7F8690',
  brand: '#34D399',
  brandBright: '#34D399',
  brandSoft: '#16302A',
  brandInk: '#9FE9C9',
  onBrand: '#0C231B',
  expiry: '#FF8A75',
  expirySoft: '#33201D',
  expiryInk: '#F5C4B8',
  expiryLine: '#A05B4E',
  warning: '#F2B65A',
  warningSoft: '#312716',
  frost: '#7CC4F2',
  frostSoft: '#17262F',
  frostInk: '#B4DCF7',
};

// ── Preferencia de aspecto ────────────────────────────────────────────────
//
// Se guarda EN EL DISPOSITIVO y no en la cuenta, a propósito: el aspecto es
// una preferencia del aparato —un móvil en oscuro y una tablet en claro es
// razonable—, funciona sin conexión y se aplica al instante. Guardarla en
// user_settings habría obligado a una migración para algo que no necesita
// viajar entre dispositivos.
export type Aspecto = 'system' | 'light' | 'dark';

const CLAVE = 'opsi.aspecto';

type Tema = {
  /** Lo que eligió el usuario. */
  aspecto: Aspecto;
  /** Lo que se pinta de verdad, ya resuelto contra el ajuste del sistema. */
  esquema: 'light' | 'dark';
  colores: Palette;
  setAspecto: (valor: Aspecto) => void;
};

const TemaContext = createContext<Tema | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [aspecto, setEstado] = useState<Aspecto>('system');
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void AsyncStorage.getItem(CLAVE)
      .then((guardado) => {
        if (!vivo) return;
        if (guardado === 'light' || guardado === 'dark' || guardado === 'system') {
          setEstado(guardado);
        }
        setListo(true);
      })
      // Si el almacenamiento falla —modo incógnito, permisos—, se sigue con
      // el ajuste del sistema. Quedarse en blanco sería mucho peor.
      .catch(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const setAspecto = useCallback((valor: Aspecto) => {
    setEstado(valor);
    void AsyncStorage.setItem(CLAVE, valor).catch(() => {});
  }, []);

  const valor = useMemo<Tema>(() => {
    const esquema = aspecto === 'system' ? (sistema === 'dark' ? 'dark' : 'light') : aspecto;
    return { aspecto, esquema, colores: esquema === 'dark' ? OSCURO : CLARO, setAspecto };
  }, [aspecto, sistema, setAspecto]);

  // Nada se pinta hasta saber qué aspecto toca: arrancar en claro y saltar a
  // oscuro medio segundo después se ve como un fogonazo. La lectura tarda unos
  // milisegundos, mucho menos que cargar las tipografías.
  if (!listo) return null;

  return <TemaContext value={valor}>{children}</TemaContext>;
}

export function useAspecto(): Tema {
  const valor = use(TemaContext);
  if (!valor) throw new Error('useAspecto se ha usado fuera de <ThemeProvider>');
  return valor;
}

/** La paleta que toca ahora mismo. */
export function useTheme(): Palette {
  return useAspecto().colores;
}

/** Para sitios sin hook: el resumen diario, un script. Siempre la clara. */
export const paletas = { claro: CLARO, oscuro: OSCURO };

// ── Tipografía ────────────────────────────────────────────────────────────
//
// Bricolage Grotesque para títulos: variable, con carácter, es lo que pone lo
// «juvenil» sin recurrir a una redonda infantil. Plus Jakarta Sans para todo
// lo demás, por sus números, que en esta app se leen todo el rato.
export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 14, pill: 999 } as const;

/** Mínimo de accesibilidad para cualquier cosa pulsable. */
export const touchTarget = 44;

/**
 * La barra de pestañas: una píldora que flota, separada de los bordes.
 *
 * Las medidas viven aquí y no en el layout de las pestañas porque las usan
 * dos sitios que tienen que cuadrar: la propia barra y el hueco que dejan al
 * final las pantallas que se desplazan. Cambiar el alto en un solo sitio y
 * que la última fila quede medio tapada es el fallo clásico.
 *
 * `radio` es la mitad del alto: eso es lo que hace que los extremos sean
 * semicírculos y no un rectángulo con las esquinas limadas.
 */
export const barra = { alto: 62, margen: 14, radio: 31 } as const;

/**
 * Lo que hay que dejar libre al final de una lista para que la barra de
 * pestañas no tape la última fila. La barra flota sobre el contenido —es lo
 * que permite verlo correr por debajo— y eso significa que ya no reserva su
 * propio espacio.
 *
 * Se mide desde el área segura, que es donde acaba el contenido de las
 * pantallas: alto de la píldora, su separación de abajo, y un respiro para
 * que la última tarjeta no quede lamiendo el cristal.
 */
export const tabBarClearance = barra.alto + barra.margen + space.xl;

/**
 * Sombra única del sistema: muy suave. La jerarquía la dan el color y el
 * espacio, no la profundidad. En oscuro se sube, porque una sombra al 4 %
 * sobre un fondo oscuro no se ve.
 */
export function elevation(dark: boolean) {
  return {
    shadowColor: '#000',
    shadowOpacity: dark ? 0.35 : 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  } as const;
}

/**
 * La sombra de lo que flota. Hoy solo la barra de pestañas.
 *
 * Es la única excepción a `elevation()`, y tiene motivo: una píldora
 * suspendida sobre una lista que corre por debajo necesita despegarse de
 * ella. Con la sombra de una tarjeta parece pegada al fondo, y entonces la
 * lista se ve pasar por dentro de la barra en vez de por debajo.
 */
export function sombraFlotante(dark: boolean) {
  return {
    shadowColor: '#000',
    shadowOpacity: dark ? 0.5 : 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  } as const;
}

/**
 * Un color de la paleta con transparencia.
 *
 * Todos los tokens son hex de seis cifras, así que basta con pegarles el
 * canal alfa. Existe para no escribir `rgba(255, 255, 255, .88)` a mano en
 * una pantalla: eso deja de seguir al tema en cuanto alguien cambia la
 * paleta.
 */
export function conAlpha(hex: string, alpha: number): string {
  const canal = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${canal}`;
}

/**
 * Cifras que no bailan al actualizarse. Para cantidades y fechas.
 *
 * Tipado como TextStyle y sin `as const`: con el literal de solo lectura no se
 * podía usar dentro de makeStyles, que es el único sitio donde hace falta.
 */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Hojas de estilo que conocen el tema.
 *
 *     const useStyles = makeStyles((c) => ({ caja: { backgroundColor: c.surface } }));
 *     // dentro del componente:
 *     const styles = useStyles();
 *
 * Se memoiza por paleta, así que cambiar de claro a oscuro reconstruye la hoja
 * una vez y no en cada render.
 */
export function makeStyles<T extends Styles>(build: (c: Palette) => T) {
  return function useStyles(): T {
    const c = useTheme();
    return useMemo(() => StyleSheet.create(build(c)), [c]);
  };
}

/**
 * La escala tipográfica, ya con su color.
 *
 * Vive aquí y no suelta en cada pantalla porque el tamaño y el peso de un
 * título son una decisión del sistema, no de quien escribe la pantalla. Si un
 * día el título baja de 30 a 28, baja en toda la app.
 */
function typeScale(c: Palette) {
  return {
    title: {
      fontFamily: fonts.display,
      fontSize: 30,
      lineHeight: 34,
      letterSpacing: -0.6,
      color: c.ink,
    },
    heading: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.ink },
    body: { fontFamily: fonts.body, fontSize: 15, color: c.ink },
    bodySmall: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.inkMuted },
    caption: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: c.inkFaint },
    label: { fontFamily: fonts.medium, fontSize: 12.5, color: c.inkMuted },
    section: {
      fontFamily: fonts.bold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      color: c.inkMuted,
    },
  };
}

export function useType() {
  const c = useTheme();
  return useMemo(() => StyleSheet.create(typeScale(c)), [c]);
}

/**
 * Las cuentas de calendario del selector de fecha.
 *
 * Fechas siempre como texto ISO de calendario («2026-10-24»), sin hora y sin zona: lo
 * que se guarda en la base de datos es un `date`, y pasar por un `Date` con hora
 * invita a que el cambio de hora o la zona muevan un día. Todo se calcula con
 * `Date.UTC`, que no tiene cambios de hora, y solo «hoy» mira el reloj.
 *
 * Sin dependencias (ni de React Native ni de otros ficheros) para poder probarlo con
 * Node tal cual.
 */

const MS_DIA = 86_400_000;

const dos = (n: number) => String(n).padStart(2, '0');

export function aIso(y: number, m: number, d: number): string {
  return `${y}-${dos(m)}-${dos(d)}`;
}

/** «2026-10-24» → { y: 2026, m: 10, d: 24 }. */
export function partes(iso: string): { y: number; m: number; d: number } {
  const [y = 0, m = 0, d = 0] = iso.split('-').map(Number);
  return { y, m, d };
}

/** El día de hoy en el calendario de este dispositivo. */
export function hoyIso(ahora: Date = new Date()): string {
  return aIso(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
}

function enMs(iso: string): number {
  const { y, m, d } = partes(iso);
  return Date.UTC(y, m - 1, d);
}

/** La fecha N días después (o antes, si N es negativo). */
export function sumarDias(iso: string, n: number): string {
  const f = new Date(enMs(iso) + n * MS_DIA);
  return aIso(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
}

/** Cuántos días de calendario hay de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((enMs(hasta) - enMs(desde)) / MS_DIA);
}

/**
 * Lo que se puede elegir: de hace un año a dentro de cinco. Más allá no es una fecha
 * de un alimento sino un error de tecleo; antes de ayer-menos-un-año, tampoco.
 */
export function limites(hoy: string = hoyIso()): { min: string; max: string } {
  return { min: sumarDias(hoy, -366), max: sumarDias(hoy, 1825) };
}

/** Deja una fecha dentro de los límites. */
export function acotar(iso: string, hoy: string = hoyIso()): string {
  const { min, max } = limites(hoy);
  return iso < min ? min : iso > max ? max : iso;
}

/** ¿Es un texto de fecha ISO real (y no «2026-02-31»)? */
export function esFechaIso(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const { y, m, d } = partes(valor);
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** El mes anterior o siguiente de (año, mes). El mes va de 1 a 12. */
export function mesDesplazado(y: number, m: number, delta: number): { y: number; m: number } {
  const indice = y * 12 + (m - 1) + delta;
  return { y: Math.floor(indice / 12), m: (indice % 12) + 1 };
}

/**
 * Las semanas de un mes, de lunes a domingo, siempre seis filas (así la hoja no
 * cambia de alto al pasar de mes). Fuera del mes, `null`.
 */
export function semanasDelMes(y: number, m: number): (string | null)[][] {
  const primero = new Date(Date.UTC(y, m - 1, 1));
  // getUTCDay: domingo = 0. Con la semana empezando en lunes, el lunes es 0 y el domingo 6.
  const hueco = (primero.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const celdas: (string | null)[] = [];
  for (let i = 0; i < hueco; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(aIso(y, m, d));
  while (celdas.length < 42) celdas.push(null);

  return Array.from({ length: 6 }, (_, fila) => celdas.slice(fila * 7, fila * 7 + 7));
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function nombreDelMes(m: number): string {
  return MESES[m - 1] ?? '';
}

/**
 * «sáb 24 oct 2026». Con tablas propias y no con `toLocaleDateString`: la salida de
 * `Intl` cambia entre motores (Hermes, V8, Safari) y entre versiones, y aquí el texto
 * tiene que ser el mismo en cada pantalla y en cada prueba.
 */
export function etiquetaFecha(iso: string): string {
  const { y, m, d } = partes(iso);
  const dia = DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dia} ${d} ${MESES_CORTOS[m - 1]} ${y}`;
}

/** «24 de octubre de 2026»: para el lector de pantalla, que lee mejor la frase entera. */
export function fechaHablada(iso: string): string {
  const { y, m, d } = partes(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Lo que falta (o lo que pasó) respecto a hoy, dicho como se diría. */
export function distancia(iso: string, hoy: string = hoyIso()): string {
  const n = diasEntre(hoy, iso);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n > 0) return `Dentro de ${n} días`;
  return `Hace ${-n} días`;
}

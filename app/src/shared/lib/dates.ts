/**
 * Cómo se cuentan y se cuentan los días.
 *
 * `days_left` lo calcula la vista de la base de datos, no el cliente: el mismo
 * número lo usan la pantalla, el resumen diario y la asistente, y tenerlo en
 * tres sitios es garantizar que diverjan.
 *
 * Lo que sí es de aquí es traducir ese número a algo que una persona lea.
 */

export function describeDaysLeft(daysLeft: number | null): string {
  if (daysLeft === null) return 'Sin fecha';
  if (daysLeft < -1) return `Venció hace ${Math.abs(daysLeft)} días`;
  if (daysLeft === -1) return 'Venció ayer';
  if (daysLeft === 0) return 'Hoy';
  if (daysLeft === 1) return 'Mañana';
  if (daysLeft < 31) return `En ${daysLeft} días`;
  const months = Math.round(daysLeft / 30);
  return months === 1 ? 'En un mes' : `En ${months} meses`;
}

/** De dónde sale la fecha. Se muestra SIEMPRE: es un principio del proyecto. */
export function describeDateSource(source: string | null): string {
  switch (source) {
    case 'package':
      return 'del envase';
    case 'user':
      return 'la pusiste tú';
    case 'manufacturer':
      return 'del fabricante';
    case 'reference':
      return 'orientativo';
    case 'estimate':
      return 'estimado';
    default:
      return '';
  }
}

/** Por qué esa fecha y no otra. Lo explica la pantalla de detalle. */
export function describeReason(reason: string | null): string {
  switch (reason) {
    case 'after_thawing':
      return 'tras descongelar';
    case 'after_opening':
      return 'tras abrir';
    case 'label':
      return '';
    default:
      return '';
  }
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Lo mismo que describeDaysLeft, pero partido en piezas.
 *
 * La lista lo necesita así por una razón de maquetación, no de estilo: con la
 * frase entera («Venció hace 12 días» frente a «Hoy») cada fila mide distinto,
 * la columna de la derecha baila y con tres o cuatro elementos la lista parece
 * rota. Separando la etiqueta del número, la columna tiene un ancho fijo y
 * todas las filas alinean.
 */
export type DiasRestantes = {
  /** El encabezado en versalitas: PREFERENTE, LÍMITE, VENCIÓ… */
  etiqueta: string;
  /** Lo grande: un número, o una palabra cuando el número no ayuda. */
  valor: string;
  /** La unidad, cuando `valor` es un número. Vacío si no aplica. */
  unidad: string;
  vencido: boolean;
};

/**
 * @param etiqueta Qué clase de fecha es: «Caduca», «Preferente» o «Límite».
 *   Lo decide quien llama, porque depende de `date_kind` y del motivo, y esta
 *   función no tiene por qué saber de inventarios.
 */
export function diasRestantes(daysLeft: number | null, etiqueta: string): DiasRestantes {
  if (daysLeft === null) {
    return { etiqueta: 'Sin fecha', valor: '—', unidad: '', vencido: false };
  }
  if (daysLeft < -1) {
    return { etiqueta: 'Venció', valor: `${Math.abs(daysLeft)}`, unidad: 'días', vencido: true };
  }
  if (daysLeft === -1) return { etiqueta: 'Venció', valor: 'Ayer', unidad: '', vencido: true };
  if (daysLeft === 0) return { etiqueta, valor: 'Hoy', unidad: '', vencido: false };
  if (daysLeft === 1) return { etiqueta, valor: 'Mañana', unidad: '', vencido: false };
  if (daysLeft < 31) return { etiqueta, valor: `${daysLeft}`, unidad: 'días', vencido: false };

  const meses = Math.round(daysLeft / 30);
  return { etiqueta, valor: `${meses}`, unidad: meses === 1 ? 'mes' : 'meses', vencido: false };
}

/**
 * Días completos transcurridos desde una marca de tiempo.
 *
 * Se compara por DÍA DEL CALENDARIO y no por horas: congelar algo anoche y
 * mirarlo esta mañana tiene que decir «ayer», no «hace 0 días». Es la misma
 * cuenta que hace `thaw_item` en SQL, que resta fechas y no instantes.
 */
export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const desde = new Date(iso);
  if (Number.isNaN(desde.getTime())) return null;

  const aMedianoche = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.floor((aMedianoche(new Date()) - aMedianoche(desde)) / 86_400_000);
  return Math.max(0, dias);
}

/** «hoy», «ayer», «hace 5 días». Para contar desde cuándo pasa algo. */
export function describeDesde(iso: string | null): string | null {
  const dias = diasDesde(iso);
  if (dias === null) return null;
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

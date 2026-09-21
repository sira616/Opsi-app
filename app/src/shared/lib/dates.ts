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

/**
 * Unidades, según la decisión D-07.
 *
 * La regla que ordena todo esto: en la base de datos la cantidad se guarda
 * SIEMPRE en unidad base —gramos, mililitros o piezas— y aparte se guarda la
 * unidad que eligió el usuario, solo para mostrarla como la escribió. Quien
 * compra «1 kg de arroz» quiere leer «1 kg», no «1000 g».
 *
 * Entre familias no se convierte NUNCA: 200 g de harina no son 200 ml de
 * harina. Por eso la familia no se elige por separado, sale de la unidad.
 */

export type UnitFamily = 'mass' | 'volume' | 'count';
export type MeasurementUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit';

type UnitSpec = {
  unit: MeasurementUnit;
  family: UnitFamily;
  /** Cuántas unidades base vale una de estas. */
  factor: number;
  label: string;
};

export const UNITS: readonly UnitSpec[] = [
  { unit: 'g', family: 'mass', factor: 1, label: 'g' },
  { unit: 'kg', family: 'mass', factor: 1000, label: 'kg' },
  { unit: 'ml', family: 'volume', factor: 1, label: 'ml' },
  { unit: 'l', family: 'volume', factor: 1000, label: 'l' },
  { unit: 'unit', family: 'count', factor: 1, label: 'ud.' },
] as const;

function spec(unit: MeasurementUnit): UnitSpec {
  const found = UNITS.find((u) => u.unit === unit);
  if (!found) throw new Error(`Unidad desconocida: ${unit}`);
  return found;
}

export function familyOf(unit: MeasurementUnit): UnitFamily {
  return spec(unit).family;
}

/** De lo que escribe el usuario a lo que se guarda. */
export function toBase(quantity: number, unit: MeasurementUnit): number {
  return quantity * spec(unit).factor;
}

/** De lo guardado a lo que se enseña. */
export function fromBase(base: number, unit: MeasurementUnit): number {
  return base / spec(unit).factor;
}

/**
 * Cantidad lista para pintar. Redondea a dos decimales y se come los ceros
 * finales, para que 0.5 kg salga como «0,5 kg» y no como «0,50 kg».
 */
export function formatQuantity(base: number, unit: MeasurementUnit): string {
  const value = fromBase(base, unit);
  const rounded = Math.round(value * 100) / 100;
  const text = rounded.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return unit === 'unit' ? `${text} ud.` : `${text} ${spec(unit).label}`;
}

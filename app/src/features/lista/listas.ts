import type { Lista, TipoLista } from '@/api/lista';
import type { Plan } from '@/api/settings';

/**
 * Las reglas de las listas que no necesitan pantalla ni red.
 *
 * Una lista es INDIVIDUAL (de la cuenta, se usa desde cualquier nevera) o COMPARTIDA (de una
 * nevera y de todos sus miembros). Los topes son POR CUENTA y los impone el servidor
 * (`check_shopping_list`); aquí solo se repiten para no ofrecer un botón que va a fallar y para
 * poder explicar el porqué. Si algún día cambian allí y no aquí, el servidor rechaza igualmente
 * y su mensaje sale tal cual.
 */
export const TOPE_LISTAS = {
  basic: { compartidas: 1, individuales: 1 },
  premium: { total: 5 },
} as const;

/** Por fecha de creación y, a igualdad, por id: el mismo orden que el servidor, para que «la principal» sea estable. */
function porAntiguedad(a: Lista, b: Lista): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

/**
 * Las listas que se enseñan al mirar UNA nevera: todas las individuales (van contigo a cualquier
 * nevera) y las compartidas de ESA nevera. Las compartidas de otras neveras no salen aquí.
 */
export function listasDeLaNevera(todas: readonly Lista[], neveraId: string): Lista[] {
  const individuales = todas.filter((l) => l.kind === 'personal').sort(porAntiguedad);
  const compartidas = todas
    .filter((l) => l.kind === 'shared' && l.household_id === neveraId)
    .sort(porAntiguedad);
  return [...individuales, ...compartidas];
}

/**
 * Dónde se apunta algo si no se elige: la primera compartida de la nevera de la que sale (lo
 * de una nevera compartida se compra entre todos) y, si no hay, la primera individual. Con
 * `neveraId` nulo, la individual.
 */
export function listaPorDefecto(todas: readonly Lista[], neveraId: string | null): Lista | undefined {
  const ordenadas = [...todas].sort(porAntiguedad);
  const compartida =
    neveraId === null
      ? undefined
      : ordenadas.find((l) => l.kind === 'shared' && l.household_id === neveraId);
  return compartida ?? ordenadas.find((l) => l.kind === 'personal') ?? ordenadas[0];
}

/** Cuántas listas ha creado la persona, por tipo. */
export type Cupo = { compartidas: number; individuales: number };

/**
 * Lo que cuenta para el tope. Las individuales que se ven son todas suyas. De las compartidas
 * solo cuentan las que creó ella (en una nevera compartida puede haber otras de otra gente).
 * Sin saber quién es, ninguna compartida cuenta: el servidor decide igualmente.
 */
export function cupoDe(todas: readonly Lista[], miId: string | null): Cupo {
  return {
    individuales: todas.filter((l) => l.kind === 'personal').length,
    compartidas:
      miId === null ? 0 : todas.filter((l) => l.kind === 'shared' && l.created_by === miId).length,
  };
}

export type Veredicto =
  | { cabe: true }
  /** `conPremium`: el motivo se arregla con el plan (se ofrece «Ver Opsi Premium»). */
  | { cabe: false; motivo: string; conPremium: boolean };

/** ¿Cabe otra lista de este tipo con este plan? Los mensajes son los del servidor. */
export function cabeOtra(plan: Plan, tipo: TipoLista, cupo: Cupo): Veredicto {
  if (plan === 'premium') {
    const total = TOPE_LISTAS.premium.total;
    return cupo.compartidas + cupo.individuales >= total
      ? { cabe: false, motivo: `Has llegado al máximo de ${total} listas.`, conPremium: false }
      : { cabe: true };
  }
  const tope = TOPE_LISTAS.basic;
  if (tipo === 'shared' && cupo.compartidas >= tope.compartidas) {
    return {
      cabe: false,
      motivo: `Con el plan básico puedes tener ${tope.compartidas} lista compartida. Opsi Premium ⭐ te da más.`,
      conPremium: true,
    };
  }
  if (tipo === 'personal' && cupo.individuales >= tope.individuales) {
    return {
      cabe: false,
      motivo: `Con el plan básico puedes tener ${tope.individuales} lista individual. Opsi Premium ⭐ te da más.`,
      conPremium: true,
    };
  }
  return { cabe: true };
}

/** Si cabe alguna lista de algún tipo: para saber si «Nueva lista» lleva a algún sitio. */
export function cabeAlguna(plan: Plan, cupo: Cupo): boolean {
  return cabeOtra(plan, 'personal', cupo).cabe || cabeOtra(plan, 'shared', cupo).cabe;
}

/** Cómo se dice de qué tipo es una lista: «Individual» o «Compartida · Piso». */
export function describirLista(lista: Pick<Lista, 'kind' | 'household_id'>, neveras: readonly { id: string; name: string }[]): string {
  if (lista.kind === 'personal') return 'Individual';
  const nevera = neveras.find((n) => n.id === lista.household_id);
  return nevera ? `Compartida · ${nevera.name}` : 'Compartida';
}

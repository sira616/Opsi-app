/**
 * Lo que la asistente puede hacer: las herramientas que el modelo puede pedir.
 *
 * Versión 1: SOLO LECTURA. Que el modelo pueda apuntar o tirar cosas (escritura) se añade
 * después, cuando las lecturas estén probadas con un modelo real, y solo llamando a las
 * mismas funciones de la base de datos que usa la app (`finish_item`, `create_item`…), con
 * la sesión de la persona.
 *
 * Reglas que valen para todas:
 *   · Los argumentos los escribe un modelo: son entrada no confiable. Cada herramienta los
 *     valida y, si no valen, devuelve un error que el modelo puede leer y corregir.
 *   · Lo que devuelven es DATO, no instrucción. Los nombres de producto los escribe quien
 *     sea (o vienen de Open Food Facts): se limpian de caracteres que no se ven ni de dirección y
 *     se acotan (`sanearDato`), y el bucle los entrega al modelo marcados como datos. Es defensa
 *     en profundidad: lo que protege de verdad es que estas herramientas SOLO LEEN.
 *   · Las consultas corren con el token de la persona (ver `index.ts`): la RLS limita lo que
 *     se ve. Aquí no hay ningún filtro de hogar, a propósito: si hiciera falta uno, sería
 *     señal de que la RLS falla.
 */

import type { DescripcionHerramienta } from './modelo.ts';
import { sanearDato } from './saneo.ts';

export type Prioridad = 'high' | 'medium' | 'low' | 'undated' | 'frozen';
const PRIORIDADES: readonly Prioridad[] = ['high', 'medium', 'low', 'undated', 'frozen'];

export const MAX_FILAS_HERRAMIENTA = 40;

export type FilaInventario = {
  name: string;
  state: string;
  location: string;
  unit_family: 'mass' | 'volume' | 'count';
  remaining_quantity: number;
  effective_limit_date: string | null;
  effective_date_source: string | null;
  days_left: number | null;
  priority: string;
};

export type FilaLista = {
  name: string;
  unit_family: 'mass' | 'volume' | 'count' | null;
  quantity: number | null;
};

/** Acceso a los datos de la persona. En `index.ts` son consultas con SU sesión. */
export type AccesoDatos = {
  inventario(filtro: { prioridad: Prioridad | null; limite: number }): Promise<FilaInventario[]>;
  listaCompra(limite: number): Promise<FilaLista[]>;
};

export type Herramienta = {
  descripcion: DescripcionHerramienta;
  /** Devuelve algo serializable. Si los argumentos no valen, lanza `ErrorArgumentos`. */
  ejecutar(argumentos: unknown, datos: AccesoDatos): Promise<unknown>;
};

export class ErrorArgumentos extends Error {}

const UNIDAD_BASE = { mass: 'g', volume: 'ml', count: 'unidades' } as const;

function objeto(argumentos: unknown): Record<string, unknown> {
  if (argumentos === null || argumentos === undefined) return {};
  if (typeof argumentos === 'object' && !Array.isArray(argumentos)) {
    return argumentos as Record<string, unknown>;
  }
  throw new ErrorArgumentos('los argumentos tienen que ser un objeto');
}

function limiteDe(valor: unknown): number {
  if (valor === undefined || valor === null) return MAX_FILAS_HERRAMIENTA;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1) {
    throw new ErrorArgumentos('limite tiene que ser un entero mayor que 0');
  }
  return Math.min(valor, MAX_FILAS_HERRAMIENTA);
}

const verInventario: Herramienta = {
  descripcion: {
    nombre: 'ver_inventario',
    descripcion:
      'Lista lo que hay ahora en las neveras y despensas de la persona (lo agotado o tirado no sale), ' +
      'ordenado por urgencia. Cada elemento trae la fecha límite efectiva, los días que quedan ' +
      '(negativo = ya pasó) y su prioridad. Úsala siempre antes de decir qué hay, qué caduca o qué cenar.',
    parametros: {
      type: 'object',
      properties: {
        prioridad: {
          type: 'string',
          enum: [...PRIORIDADES],
          description:
            'Opcional. high = vence hoy, mañana o ya pasó; medium = en 2-4 días; low = más adelante; ' +
            'undated = sin fecha; frozen = congelado.',
        },
        limite: { type: 'integer', description: `Opcional. Máximo ${MAX_FILAS_HERRAMIENTA}.` },
      },
    },
  },
  async ejecutar(argumentos, datos) {
    const a = objeto(argumentos);
    let prioridad: Prioridad | null = null;
    if (a.prioridad !== undefined && a.prioridad !== null) {
      if (!PRIORIDADES.includes(a.prioridad as Prioridad)) {
        throw new ErrorArgumentos(`prioridad tiene que ser una de: ${PRIORIDADES.join(', ')}`);
      }
      prioridad = a.prioridad as Prioridad;
    }
    const filas = await datos.inventario({ prioridad, limite: limiteDe(a.limite) });
    return {
      total: filas.length,
      elementos: filas.map((f) => ({
        nombre: sanearDato(f.name),
        estado: f.state,
        sitio: f.location,
        cantidad: `${f.remaining_quantity} ${UNIDAD_BASE[f.unit_family]}`,
        fecha_limite: f.effective_limit_date,
        dias_que_quedan: f.days_left,
        // De dónde sale la fecha: la del envase, una estimación por apertura/descongelado, o la
        // que puso la persona. Lo orientativo se dice como orientativo.
        origen_fecha: f.effective_date_source,
        prioridad: f.priority,
      })),
    };
  },
};

const verListaCompra: Herramienta = {
  descripcion: {
    nombre: 'ver_lista_compra',
    descripcion: 'Lista lo que la persona tiene apuntado para comprar y todavía no ha comprado.',
    parametros: {
      type: 'object',
      properties: {
        limite: { type: 'integer', description: `Opcional. Máximo ${MAX_FILAS_HERRAMIENTA}.` },
      },
    },
  },
  async ejecutar(argumentos, datos) {
    const a = objeto(argumentos);
    const filas = await datos.listaCompra(limiteDe(a.limite));
    return {
      total: filas.length,
      pendientes: filas.map((f) => ({
        nombre: sanearDato(f.name),
        cantidad:
          f.quantity !== null && f.unit_family ? `${f.quantity} ${UNIDAD_BASE[f.unit_family]}` : null,
      })),
    };
  },
};

export const HERRAMIENTAS: readonly Herramienta[] = [verInventario, verListaCompra];

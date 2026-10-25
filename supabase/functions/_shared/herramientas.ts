/**
 * Lo que la asistente puede hacer: las herramientas que el modelo puede pedir.
 *
 * El modelo LEE (`ver_inventario`, `ver_lista_compra`) y PROPONE (`proponer_*`), pero NO ESCRIBE: ni
 * esta función ni sus herramientas tienen forma de cambiar nada (`AccesoDatos` solo lee). Una
 * propuesta es un dato que sale en la respuesta; la app la enseña, la persona la confirma, y es la
 * APP quien llama a las funciones de siempre (`create_item`, `finish_item`…) con su sesión. Un test
 * comprueba que `AccesoDatos` no gana ningún método de escritura sin que alguien lo decida.
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
import { nombreEsNoComida } from './nocomida.ts';
import { sanearDato } from './saneo.ts';

export type Prioridad = 'high' | 'medium' | 'low' | 'undated' | 'frozen';
const PRIORIDADES: readonly Prioridad[] = ['high', 'medium', 'low', 'undated', 'frozen'];

export const MAX_FILAS_HERRAMIENTA = 40;

export type FilaInventario = {
  id: string;
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
  /** Elementos concretos por id (los que no existan o no sean de la persona no salen). */
  elementos(ids: string[]): Promise<FilaElemento[]>;
};

/** Lo que se necesita de un elemento para validar una propuesta sobre él. */
export type FilaElemento = {
  id: string;
  name: string;
  unit_family: 'mass' | 'volume' | 'count';
};

/** Lo que una herramienta puede hacer además de leer: dejar una propuesta en la respuesta. */
export type ContextoHerramienta = {
  proponer(propuesta: Propuesta): void;
};

export type Herramienta = {
  descripcion: DescripcionHerramienta;
  /** Devuelve algo serializable. Si los argumentos no valen, lanza `ErrorArgumentos`. */
  ejecutar(argumentos: unknown, datos: AccesoDatos, contexto: ContextoHerramienta): Promise<unknown>;
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
        // El id es lo que hay que devolver al proponer gastar o tirar algo.
        id: f.id,
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

// ── Propuestas: lo que la asistente PUEDE PEDIR, nunca hacer ─────────────────────────────────────
//
// Estas herramientas NO escriben nada. Validan lo que dice el modelo, lo apuntan en una lista
// (`contexto.proponer`) y se lo cuentan al modelo como «pendiente de confirmar». La lista sale en
// la respuesta de la función, la app la enseña con «Sí» y «No» y, solo si la persona dice que sí,
// ES LA APP quien llama a las funciones de siempre (`create_item`, `use_quantity`, `finish_item`,
// `discard_item`, apuntar en una lista) con la sesión de esa persona. Si el modelo se equivoca o un
// dato inyectado le dice que apunte algo, lo peor que pasa es una tarjeta que la persona rechaza.
//
// Lo que sale hacia la app se vuelve a validar allí: esto es entrada de un modelo, y la app no se
// fía ni de nuestro servidor (`features/chat/propuestas.ts`).

export type UnidadPropuesta = 'unidades' | 'g' | 'kg' | 'ml' | 'l';
const UNIDADES: readonly UnidadPropuesta[] = ['unidades', 'g', 'kg', 'ml', 'l'];
/** A qué familia pertenece cada unidad: un gasto solo vale en la familia del elemento. */
const FAMILIA_DE: Record<UnidadPropuesta, 'mass' | 'volume' | 'count'> = {
  unidades: 'count',
  g: 'mass',
  kg: 'mass',
  ml: 'volume',
  l: 'volume',
};

/** Un producto que se propone apuntar o guardar. Los nombres los escribe el modelo: limpios y acotados. */
export type LineaPropuesta = { nombre: string; cantidad: number | null; unidad: UnidadPropuesta | null };

/** Algo que YA está en la nevera y se propone gastar, terminar o tirar. El nombre sale de la base de datos. */
export type ElementoPropuesto = {
  id: string;
  nombre: string;
  /** Cuánto se gasta. Null cuando `todo`. */
  cantidad: number | null;
  unidad: UnidadPropuesta | null;
  /** Se gasta entero (queda terminado). */
  todo: boolean;
};

export type Propuesta =
  | { tipo: 'apuntar'; productos: LineaPropuesta[] }
  | { tipo: 'guardar'; productos: LineaPropuesta[] }
  | { tipo: 'gastar'; elementos: ElementoPropuesto[] }
  | { tipo: 'tirar'; elementos: ElementoPropuesto[] };

/** Lo que se le cuenta al modelo: todavía no se ha hecho nada. */
const AVISO_PENDIENTE =
  'Todavía NO se ha hecho nada. La persona verá esta propuesta en la app y tiene que confirmarla. ' +
  'Pregúntale en una frase si es correcto y no digas que está hecho.';

export const MAX_LINEAS_PROPUESTA = 12;
/** Tope de cantidad: lo mismo que acepta la base de datos para una línea o un elemento. */
const MAX_CANTIDAD_PROPUESTA = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lista(valor: unknown, que: string): unknown[] {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new ErrorArgumentos(`${que} tiene que ser una lista con al menos un elemento`);
  }
  if (valor.length > MAX_LINEAS_PROPUESTA) {
    throw new ErrorArgumentos(`${que} admite como mucho ${MAX_LINEAS_PROPUESTA} elementos`);
  }
  return valor;
}

function cantidadDe(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > MAX_CANTIDAD_PROPUESTA) {
    throw new ErrorArgumentos('cantidad tiene que ser un número mayor que 0');
  }
  return Math.round(valor * 1000) / 1000;
}

function unidadDe(valor: unknown): UnidadPropuesta | null {
  if (valor === undefined || valor === null) return null;
  if (!UNIDADES.includes(valor as UnidadPropuesta)) {
    throw new ErrorArgumentos(`unidad tiene que ser una de: ${UNIDADES.join(', ')}`);
  }
  return valor as UnidadPropuesta;
}

/** Productos por nombre (apuntar y guardar). Con cantidad va su unidad, y sin ella no hay ninguna. */
function productosDe(valor: unknown, que: string, soloComida: boolean): LineaPropuesta[] {
  const productos: LineaPropuesta[] = [];
  for (const crudo of lista(valor, que)) {
    const p = objeto(crudo);
    const nombre = sanearDato(p.nombre);
    if (nombre === '') throw new ErrorArgumentos('cada producto necesita un nombre');
    if (soloComida && nombreEsNoComida(nombre)) {
      throw new ErrorArgumentos(`«${nombre}» no es comida ni bebida: Opsi solo guarda comida y bebida`);
    }
    const cantidad = cantidadDe(p.cantidad);
    const unidad = unidadDe(p.unidad);
    if (cantidad !== null && unidad === null) {
      throw new ErrorArgumentos(`«${nombre}»: si pones cantidad, pon también su unidad`);
    }
    productos.push({ nombre, cantidad, unidad: cantidad === null ? null : unidad });
  }
  return productos;
}

/** Elementos de la nevera por id: tienen que existir y ser de la persona (la RLS lo decide al leerlos). */
async function elementosDe(
  valor: unknown,
  que: string,
  datos: AccesoDatos,
  conCantidad: boolean,
): Promise<ElementoPropuesto[]> {
  const pedidos = lista(valor, que).map((c) => objeto(c));
  const ids = pedidos.map((p) => {
    if (typeof p.id !== 'string' || !UUID.test(p.id)) {
      throw new ErrorArgumentos('cada elemento necesita el id que te dio ver_inventario');
    }
    return p.id.toLowerCase();
  });
  if (new Set(ids).size !== ids.length) throw new ErrorArgumentos('hay un elemento repetido');

  const filas = await datos.elementos(ids);
  const porId = new Map(filas.map((f) => [f.id.toLowerCase(), f]));
  const elementos: ElementoPropuesto[] = [];
  for (const [i, p] of pedidos.entries()) {
    const fila = porId.get(ids[i] as string);
    // Mismo mensaje para «no existe» y «no es tuyo»: no se confirma qué ids hay.
    if (!fila) throw new ErrorArgumentos('uno de los ids no existe o ya está terminado; vuelve a mirar el inventario');
    const nombre = sanearDato(fila.name);

    if (!conCantidad) {
      elementos.push({ id: fila.id, nombre, cantidad: null, unidad: null, todo: true });
      continue;
    }
    const todo = p.todo === true;
    const cantidad = cantidadDe(p.cantidad);
    const unidad = unidadDe(p.unidad);
    if (!todo && cantidad === null) {
      throw new ErrorArgumentos(`«${nombre}»: di cuánto se gasta (cantidad y unidad) o pon todo: true`);
    }
    if (!todo && unidad === null) throw new ErrorArgumentos(`«${nombre}»: falta la unidad`);
    if (!todo && unidad !== null && FAMILIA_DE[unidad] !== fila.unit_family) {
      throw new ErrorArgumentos(
        `«${nombre}» se mide en ${UNIDAD_BASE[fila.unit_family]}: no se puede gastar en ${unidad}`,
      );
    }
    elementos.push({ id: fila.id, nombre, cantidad: todo ? null : cantidad, unidad: todo ? null : unidad, todo });
  }
  return elementos;
}

const PRODUCTOS_ESQUEMA = (descripcion: string) => ({
  type: 'array',
  description: descripcion,
  items: {
    type: 'object',
    properties: {
      nombre: { type: 'string', description: 'Nombre corriente del producto, en minúsculas. Sin marcas si no hacen falta.' },
      cantidad: { type: 'number', description: 'Opcional. Cuánto.' },
      unidad: { type: 'string', enum: [...UNIDADES], description: 'Obligatoria si hay cantidad.' },
    },
    required: ['nombre'],
  },
});

const ELEMENTOS_ESQUEMA = (descripcion: string, conCantidad: boolean) => ({
  type: 'array',
  description: descripcion,
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'El id que devuelve ver_inventario. Nunca lo inventes.' },
      ...(conCantidad
        ? {
            cantidad: { type: 'number', description: 'Cuánto se ha gastado. No hace falta si pones todo.' },
            unidad: { type: 'string', enum: [...UNIDADES], description: 'La misma familia que el elemento.' },
            todo: { type: 'boolean', description: 'true si se ha gastado entero.' },
          }
        : {}),
    },
    required: ['id'],
  },
});

const proponerApuntar: Herramienta = {
  descripcion: {
    nombre: 'proponer_apuntar',
    descripcion:
      'PROPONE apuntar productos en la lista de la compra. No apunta nada: la persona lo confirma en la app. ' +
      'Úsala cuando pida apuntar algo o diga que le falta algo. Después, pregúntale si es correcto.',
    parametros: {
      type: 'object',
      properties: { productos: PRODUCTOS_ESQUEMA('Lo que se apunta.') },
      required: ['productos'],
    },
  },
  async ejecutar(argumentos, _datos, contexto) {
    const productos = productosDe(objeto(argumentos).productos, 'productos', false);
    contexto.proponer({ tipo: 'apuntar', productos });
    return { registrada: true, productos, aviso: AVISO_PENDIENTE };
  },
};

const proponerGuardar: Herramienta = {
  descripcion: {
    nombre: 'proponer_guardar',
    descripcion:
      'PROPONE guardar en la nevera lo que la persona dice que ha COMPRADO o que le ha llegado. No guarda nada: ' +
      'la persona lo confirma en la app. Solo comida y bebida. Después, pregúntale si es correcto.',
    parametros: {
      type: 'object',
      properties: { productos: PRODUCTOS_ESQUEMA('Lo que se ha comprado.') },
      required: ['productos'],
    },
  },
  async ejecutar(argumentos, _datos, contexto) {
    const productos = productosDe(objeto(argumentos).productos, 'productos', true);
    contexto.proponer({ tipo: 'guardar', productos });
    return { registrada: true, productos, aviso: AVISO_PENDIENTE };
  },
};

const proponerGastar: Herramienta = {
  descripcion: {
    nombre: 'proponer_gastar',
    descripcion:
      'PROPONE descontar de la nevera lo que la persona dice que ha COCINADO, usado o terminado. No descuenta ' +
      'nada: la persona lo confirma en la app. Primero mira el inventario para tener los ids. Si no estás seguro de ' +
      'cuál de varios productos parecidos es, pregunta antes de proponer.',
    parametros: {
      type: 'object',
      properties: { elementos: ELEMENTOS_ESQUEMA('Lo que se ha gastado.', true) },
      required: ['elementos'],
    },
  },
  async ejecutar(argumentos, datos, contexto) {
    const elementos = await elementosDe(objeto(argumentos).elementos, 'elementos', datos, true);
    contexto.proponer({ tipo: 'gastar', elementos });
    return { registrada: true, elementos: elementos.map((e) => e.nombre), aviso: AVISO_PENDIENTE };
  },
};

const proponerTirar: Herramienta = {
  descripcion: {
    nombre: 'proponer_tirar',
    descripcion:
      'PROPONE marcar como tirado algo de la nevera (caducado, estropeado). No lo tira: la persona lo confirma ' +
      'en la app. Primero mira el inventario para tener los ids.',
    parametros: {
      type: 'object',
      properties: { elementos: ELEMENTOS_ESQUEMA('Lo que se tira.', false) },
      required: ['elementos'],
    },
  },
  async ejecutar(argumentos, datos, contexto) {
    const elementos = await elementosDe(objeto(argumentos).elementos, 'elementos', datos, false);
    contexto.proponer({ tipo: 'tirar', elementos });
    return { registrada: true, elementos: elementos.map((e) => e.nombre), aviso: AVISO_PENDIENTE };
  },
};

export const HERRAMIENTAS: readonly Herramienta[] = [
  verInventario,
  verListaCompra,
  proponerApuntar,
  proponerGuardar,
  proponerGastar,
  proponerTirar,
];

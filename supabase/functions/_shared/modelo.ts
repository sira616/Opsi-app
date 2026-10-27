/**
 * La costura con el modelo de lenguaje (BITACORA D-17).
 *
 * `opsi-chat` no sabe qué modelo hay detrás: habla con un `ClienteModelo`. Hoy hay una
 * implementación, Ollama (local o Ollama Cloud: es la misma API, cambia la dirección y
 * la clave). El día que se decida el modelo de producción (Q4) se escribe otra
 * implementación —Claude, por ejemplo— y se elige con `MODELO_PROVEEDOR`, sin tocar el
 * bucle ni las herramientas.
 *
 * Sin dependencias de Deno: se prueba con `npm run test:funciones`.
 */

export type RolMensaje = 'system' | 'user' | 'assistant' | 'tool';

export type LlamadaHerramienta = {
  nombre: string;
  /** Lo que el modelo quiere pasarle. Entrada NO confiable: cada herramienta la valida. */
  argumentos: unknown;
};

export type MensajeModelo =
  | { rol: 'system'; texto: string }
  /** `imagenes`: fotos en base64 (sin el prefijo `data:`), para modelos que ven. Solo las usa `opsi-ticket`. */
  | { rol: 'user'; texto: string; imagenes?: string[] }
  | { rol: 'assistant'; texto: string; llamadas?: LlamadaHerramienta[] }
  | { rol: 'tool'; nombre: string; texto: string };

/** Una herramienta tal como se le describe al modelo. El esquema es JSON Schema. */
export type DescripcionHerramienta = {
  nombre: string;
  descripcion: string;
  parametros: Record<string, unknown>;
};

export type RespuestaModelo = { texto: string; llamadas: LlamadaHerramienta[] };

/** Cómo se quiere la respuesta, cuando no vale la de siempre. */
export type OpcionesRespuesta = {
  /** El modelo contesta solo JSON (para extraer datos de una foto en vez de conversar). */
  json?: boolean;
  /** 0 = lo más fiel posible a lo que se ve; la conversación usa 0,3. */
  temperatura?: number;
};

export interface ClienteModelo {
  responder(
    mensajes: readonly MensajeModelo[],
    herramientas: readonly DescripcionHerramienta[],
    senal?: AbortSignal,
    opciones?: OpcionesRespuesta,
  ): Promise<RespuestaModelo>;
}

/** Fallo del proveedor del modelo. El mensaje es para el log; a la persona no le llega. */
export class ErrorModelo extends Error {
  // Sin parámetro-propiedad: Node lo ejecuta sin compilar (`test:funciones`) y no lo admite.
  estado: number | undefined;
  constructor(mensaje: string, estado?: number) {
    super(mensaje);
    this.name = 'ErrorModelo';
    this.estado = estado;
  }
}

export type ConfigOllama = {
  /** `http://host.docker.internal:11434` (local) o `https://ollama.com` (Cloud). Sin `/api`. */
  baseUrl: string;
  modelo: string;
  /** Solo Ollama Cloud. Local va sin clave. */
  apiKey: string | null;
  /** Cuánto se espera al modelo antes de rendirse (ms). */
  esperaMs: number;
};

/**
 * Modelo por omisión en Ollama Cloud: `gemma4:31b`. Español bueno, *tool use* nativo y es
 * el que ya funciona con la misma clave en psique. Alternativa a probar si se queda corto
 * con las herramientas: `gpt-oss:120b`. Se cambia con `OLLAMA_MODEL`, sin tocar código.
 */
export const MODELO_POR_OMISION = 'gemma4:31b';
export const BASE_OLLAMA_CLOUD = 'https://ollama.com';

type Entorno = { get(nombre: string): string | undefined };

/** Lee la configuración del entorno. Devuelve texto de error si algo no vale. */
export function leerConfigOllama(env: Entorno): ConfigOllama | { error: string } {
  const baseUrl = (env.get('OLLAMA_BASE_URL')?.trim() || BASE_OLLAMA_CLOUD).replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+(:\d+)?$/.test(baseUrl)) {
    return { error: 'OLLAMA_BASE_URL no es una dirección válida (sin ruta: sin /api)' };
  }
  const modelo = env.get('OLLAMA_MODEL')?.trim() || MODELO_POR_OMISION;
  if (!/^[\w.\-:/]{1,100}$/.test(modelo)) return { error: 'OLLAMA_MODEL no es un nombre válido' };
  const apiKey = env.get('OLLAMA_API_KEY')?.trim() || null;
  if (baseUrl === BASE_OLLAMA_CLOUD && !apiKey) {
    return { error: 'Ollama Cloud necesita OLLAMA_API_KEY' };
  }
  const espera = Number(env.get('OLLAMA_TIMEOUT_MS') ?? 60_000);
  return {
    baseUrl,
    modelo,
    apiKey,
    esperaMs: Number.isFinite(espera) && espera >= 1000 ? Math.min(espera, 120_000) : 60_000,
  };
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** Respuesta de `POST /api/chat` de Ollama (sin streaming). Solo lo que se lee. */
type CuerpoOllama = {
  message?: {
    content?: unknown;
    tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[];
  };
};

export function crearClienteOllama(config: ConfigOllama, fetchFn: FetchFn = fetch): ClienteModelo {
  return {
    async responder(mensajes, herramientas, senal, opciones) {
      const cuerpo = {
        model: config.modelo,
        stream: false,
        ...(opciones?.json ? { format: 'json' } : {}),
        // Una conversación de cocina no necesita inventiva: cuanto más bajo, menos se inventa.
        options: { temperature: opciones?.temperatura ?? 0.3 },
        messages: mensajes.map(aFormatoOllama),
        tools: herramientas.map((h) => ({
          type: 'function',
          function: { name: h.nombre, description: h.descripcion, parameters: h.parametros },
        })),
      };
      const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.apiKey) cabeceras['Authorization'] = `Bearer ${config.apiKey}`;

      const limite = AbortSignal.timeout(config.esperaMs);
      let res: Response;
      try {
        res = await fetchFn(`${config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify(cuerpo),
          signal: senal ? AbortSignal.any([senal, limite]) : limite,
        });
      } catch (e) {
        throw new ErrorModelo(`no se pudo hablar con el modelo: ${(e as Error).name}`);
      }
      if (!res.ok) {
        // El cuerpo del error no se copia al mensaje: puede traer cosas que no son para el log.
        throw new ErrorModelo(`el modelo contestó ${res.status}`, res.status);
      }
      let json: CuerpoOllama;
      try {
        json = (await res.json()) as CuerpoOllama;
      } catch {
        throw new ErrorModelo('el modelo no contestó JSON');
      }
      const texto = typeof json.message?.content === 'string' ? json.message.content : '';
      const llamadas: LlamadaHerramienta[] = [];
      for (const t of json.message?.tool_calls ?? []) {
        const nombre = t.function?.name;
        if (typeof nombre === 'string') {
          llamadas.push({ nombre, argumentos: t.function?.arguments ?? {} });
        }
      }
      return { texto, llamadas };
    },
  };
}

function aFormatoOllama(m: MensajeModelo): Record<string, unknown> {
  switch (m.rol) {
    case 'system':
      return { role: 'system', content: m.texto };
    case 'user':
      return { role: 'user', content: m.texto, ...(m.imagenes?.length ? { images: m.imagenes } : {}) };
    case 'assistant':
      return {
        role: 'assistant',
        content: m.texto,
        ...(m.llamadas?.length
          ? {
              tool_calls: m.llamadas.map((l) => ({
                function: { name: l.nombre, arguments: l.argumentos },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_name: m.nombre, content: m.texto };
  }
}

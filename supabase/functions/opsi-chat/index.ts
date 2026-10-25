/**
 * opsi-chat — la asistente: contesta preguntas sobre lo que hay en tus neveras.
 *
 *     POST /functions/v1/opsi-chat      { "mensajes": [{ "de": "persona" | "opsi", "texto": "…" }] }
 *     →  200 { "respuesta": "…" }
 *
 * Solo la conexión con el mundo: Supabase, el modelo y las variables de entorno. La lógica
 * (validación, bucle de herramientas, qué se le dice al modelo) vive en `../_shared/chat.ts`
 * y se prueba con `npm run test:funciones`. El modelo está detrás de `ClienteModelo`
 * (`../_shared/modelo.ts`): hoy Ollama (Cloud en desarrollo), mañana el que se decida (Q4).
 *
 * A diferencia de `lookup-barcode`, aquí NO se usa la clave de servicio: las consultas corren
 * con el token de la persona, así que la RLS limita lo que la asistente puede ver. No hay
 * ninguna herramienta que pueda leer fuera de tus neveras porque no hay ninguna clave que pueda.
 *
 * Variables de entorno (supabase/functions/.env, ver supabase/.env.example):
 *   SUPABASE_URL, SUPABASE_ANON_KEY   las pone Supabase solo
 *   OLLAMA_BASE_URL                   por omisión https://ollama.com (Cloud)
 *   OLLAMA_API_KEY                    obligatoria en Cloud
 *   OLLAMA_MODEL                      por omisión gemma4:31b
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { manejar, type DependenciasChat } from '../_shared/chat.ts';
import type { AccesoDatos, FilaElemento, FilaInventario, FilaLista } from '../_shared/herramientas.ts';
import { crearClienteOllama, leerConfigOllama } from '../_shared/modelo.ts';

const url = Deno.env.get('SUPABASE_URL');
const claveAnon = Deno.env.get('SUPABASE_ANON_KEY');
if (!url || !claveAnon) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno de la función');
}

const config = leerConfigOllama(Deno.env);
if ('error' in config) {
  // Mejor no arrancar que arrancar y fallar en cada mensaje sin decir por qué.
  throw new Error(config.error);
}
const modelo = crearClienteOllama(config);

/** Un cliente por petición, con el token de quien pregunta: la RLS hace el resto. */
function clienteDe(token: string) {
  return createClient(url!, claveAnon!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const dependencias: DependenciasChat = {
  async verificarUsuario(token) {
    const { data, error } = await clienteDe(token).auth.getUser(token);
    const usuario = data?.user;
    if (error || !usuario) return null;
    if (usuario.role !== 'authenticated' || usuario.is_anonymous === true) return null;
    return { id: usuario.id };
  },

  datosDe(token): AccesoDatos {
    const db = clienteDe(token);
    return {
      async inventario({ prioridad, limite }) {
        let q = db
          .from('inventory_with_priority')
          .select(
            'id, name, state, location, unit_family, remaining_quantity, effective_limit_date, ' +
              'effective_date_source, days_left, priority',
          )
          .not('state', 'in', '(finished,discarded)')
          // Lo más urgente primero; lo sin fecha, al final.
          .order('effective_limit_date', { ascending: true, nullsFirst: false })
          .limit(limite);
        if (prioridad) q = q.eq('priority', prioridad);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as unknown as FilaInventario[];
      },
      async elementos(ids) {
        if (ids.length === 0) return [];
        const { data, error } = await db
          .from('inventory_with_priority')
          .select('id, name, unit_family')
          .in('id', ids)
          .not('state', 'in', '(finished,discarded)');
        if (error) throw error;
        return (data ?? []) as unknown as FilaElemento[];
      },
      async listaCompra(limite) {
        const { data, error } = await db
          .from('shopping_list_items')
          .select('name, unit_family, quantity')
          .eq('is_purchased', false)
          .order('created_at', { ascending: true })
          .limit(limite);
        if (error) throw error;
        return (data ?? []) as unknown as FilaLista[];
      },
    };
  },

  /**
   * Un mensaje de la cuota de ESTA persona. Va con su token (no hay clave de servicio): la función
   * `use_chat_quota` lee quién es de su sesión y apunta el uso en una tabla que nadie más toca.
   */
  async cuota(token) {
    const { data, error } = await clienteDe(token).rpc('use_chat_quota');
    // El chat es de Premium y lo dice la base de datos: 42501 con la pista `premium`. Cualquier
    // otro error sigue siendo «no se puede comprobar» y la petición no sigue.
    if (error && error.code === '42501' && error.hint === 'premium') {
      return { permitido: false, esperaS: 0, soloPremium: true };
    }
    if (error) throw error;
    const fila = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; wait_s?: unknown } | null;
    if (!fila || typeof fila.allowed !== 'boolean') throw new Error('respuesta de cuota no válida');
    return { permitido: fila.allowed, esperaS: Number(fila.wait_s) || 0 };
  },

  modelo,
  log: (evento) => console.log(JSON.stringify(evento)),
};

Deno.serve((req) => manejar(req, dependencias));

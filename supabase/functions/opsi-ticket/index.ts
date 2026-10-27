/**
 * opsi-ticket — de la foto de un ticket de supermercado a una lista de productos.
 *
 *     POST /functions/v1/opsi-ticket      { "imagen": "<JPEG o PNG en base64, sin data:>" }
 *     →  200 { "productos": [{ nombre, cantidad, unidad, comida }] }
 *
 * Solo la conexión con el mundo: Supabase, el modelo y las variables de entorno. La lógica
 * (validación de la foto, qué se le pide al modelo y cómo se lee lo que contesta) vive en
 * `../_shared/ticket.ts` y se prueba con `npm run test:funciones`.
 *
 * Como `opsi-chat`, NO usa la clave de servicio: la sesión y la cuota van con el token de la
 * persona. Es de Opsi Premium y comparte la cuota de IA con el chat. La foto no se guarda en
 * ningún sitio: llega, se manda al modelo y se olvida. Mismas variables de entorno que el chat.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { gastarCuota } from '../_shared/cuota.ts';
import { crearClienteOllama, leerConfigOllama } from '../_shared/modelo.ts';
import { manejarTicket, type DependenciasTicket } from '../_shared/ticket.ts';

const url = Deno.env.get('SUPABASE_URL');
const claveAnon = Deno.env.get('SUPABASE_ANON_KEY');
if (!url || !claveAnon) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno de la función');
}

const config = leerConfigOllama(Deno.env);
if ('error' in config) throw new Error(config.error);
const modelo = crearClienteOllama(config);

/** Un cliente por petición, con el token de quien manda la foto. */
function clienteDe(token: string) {
  return createClient(url!, claveAnon!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const dependencias: DependenciasTicket = {
  async verificarUsuario(token) {
    const { data, error } = await clienteDe(token).auth.getUser(token);
    const usuario = data?.user;
    if (error || !usuario) return null;
    if (usuario.role !== 'authenticated' || usuario.is_anonymous === true) return null;
    return { id: usuario.id };
  },

  /** La misma cuota y la misma puerta de Premium que el chat: una sola función de la base de datos. */
  cuota: (token) => gastarCuota(() => clienteDe(token).rpc('use_chat_quota')),

  modelo,
  log: (evento) => console.log(JSON.stringify(evento)),
};

Deno.serve((req) => manejarTicket(req, dependencias));

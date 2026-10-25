/**
 * opsi-marcas — de las líneas de un ticket ya leído al producto y la marca de cada una.
 *
 *     POST /functions/v1/opsi-marcas
 *       { "nevera": "<uuid>", "tienda": "texto de la cabecera o null",
 *         "lineas": [{ "id": "l0", "texto": "línea impresa", "nombre": "nombre leído" }] }
 *     →  200 { "tienda": { "clave": "mercadona" }, "lineas": [{ id, estado, candidatos, … }] }
 *
 * Solo la conexión con el mundo: Supabase, Open Food Facts y las variables de entorno. La lógica (qué se
 * pide, en qué orden se consulta, cómo se puntúa y cuándo se decide por la persona) vive en
 * `../_shared/marcas.ts` y `../_shared/resolver.ts` y se prueba con `npm run test:funciones`.
 *
 * Como `opsi-chat` y `opsi-ticket`, NO usa la clave de servicio: la sesión, el plan, el historial y el
 * catálogo van con el token de la persona (RLS), y el cupo de búsquedas hacia Open Food Facts lo
 * reserva ella misma por `consume_off_search` (que comprueba el plan y la acota). No escribe nada.
 *
 * Variables de entorno:
 *   SUPABASE_URL, SUPABASE_ANON_KEY   las pone Supabase solo
 *   OFF_USER_AGENT                    como en lookup-barcode: nombre de la app y un contacto REAL. Sin él
 *                                     (o con el de ejemplo) no se consulta Open Food Facts y la función
 *                                     sigue sirviendo el historial y el catálogo.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import { CacheTtl, type FilaAsociacion, type FilaCatalogo } from '../_shared/fuentes-marcas.ts';
import { manejarMarcas, type DependenciasMarcas } from '../_shared/marcas.ts';
import { buscarEnOff, type CandidatoOff } from '../_shared/off-busqueda.ts';
import { userAgentValido } from '../_shared/off.ts';

const url = Deno.env.get('SUPABASE_URL');
const claveAnon = Deno.env.get('SUPABASE_ANON_KEY');
if (!url || !claveAnon) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el entorno de la función');
}

const userAgent = userAgentValido(Deno.env.get('OFF_USER_AGENT'));
if (userAgent === null) {
  console.log(
    JSON.stringify({
      evento: 'opsi-marcas',
      aviso: 'OFF_USER_AGENT sin configurar o con el valor de ejemplo: no se consultará Open Food Facts',
    }),
  );
}

/** Un cliente por petición, con el token de quien manda las líneas. */
function clienteDe(token: string) {
  return createClient(url!, claveAnon!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** La caché de búsquedas de OFF vive en la memoria de esta instancia (ver `CacheTtl`). */
const cache = new CacheTtl<CandidatoOff[]>(300);

const dependencias: DependenciasMarcas = {
  async verificarUsuario(token) {
    const { data, error } = await clienteDe(token).auth.getUser(token);
    const usuario = data?.user;
    if (error || !usuario) return null;
    if (usuario.role !== 'authenticated' || usuario.is_anonymous === true) return null;
    return { id: usuario.id };
  },

  async plan(token) {
    const { data, error } = await clienteDe(token).rpc('my_plan');
    if (error) throw error;
    return typeof data === 'string' ? data : 'basic';
  },

  async asociaciones(token, claves, neveraId) {
    const { data, error } = await clienteDe(token).rpc('ticket_associations_for', {
      p_keys: claves,
      p_household_id: neveraId,
    });
    if (error) throw error;
    return (data ?? []) as FilaAsociacion[];
  },

  catalogo: (token, neveraId) => async (consulta) => {
    const { data, error } = await clienteDe(token).rpc('search_catalog', {
      p_words: consulta.palabras,
      p_household_id: neveraId,
      p_barcode: consulta.ean,
    });
    if (error) throw error;
    return (data ?? []) as FilaCatalogo[];
  },

  async reservarBusquedas(token, n) {
    const { data, error } = await clienteDe(token).rpc('consume_off_search', { p_n: n });
    if (error) throw error;
    const fila = (Array.isArray(data) ? data[0] : data) as { concedidas?: number; reintentar_en?: number } | null;
    // Si la respuesta no es la esperada no se busca: nunca se sigue sin contar.
    return {
      concedidas: Math.max(0, Math.floor(Number(fila?.concedidas ?? 0))),
      esperaS: Math.max(1, Math.floor(Number(fila?.reintentar_en ?? 60))),
    };
  },

  buscarOff: userAgent === null ? null : (consulta) => buscarEnOff(consulta, { userAgent }),
  cache,
  log: (evento) => console.log(JSON.stringify(evento)),
};

Deno.serve((req) => manejarMarcas(req, dependencias));

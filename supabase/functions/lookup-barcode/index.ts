/**
 * lookup-barcode — de un código de barras a un producto.
 *
 *     POST /functions/v1/lookup-barcode      { "barcode": "<8–14 cifras>" }
 *
 * Esto es SOLO la conexión con el mundo: Supabase, la red y las variables de
 * entorno. Qué se comprueba, en qué orden y qué se contesta vive en
 * `../_shared/lookup.ts`, que no sabe nada de Deno y por eso se prueba con
 * `npm run test:funciones`. Si algo de aquí necesita lógica, es que va allí.
 *
 * Diseño y amenazas: docs/threat-model.md §4. Lo esencial:
 *
 *   · La llamada a Open Food Facts sale del SERVIDOR, nunca del móvil.
 *   · Lo que vuelve de OFF es entrada no confiable (lo edita cualquiera): se
 *     filtra aquí y se vuelve a filtrar en `upsert_global_product`.
 *   · La clave de servicio no sale de este fichero. Y no puede escribir tablas: solo
 *     ejecutar cinco funciones de la base de datos (privilegios_test.sql).
 *
 * Variables de entorno:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   las pone Supabase solo
 *   OFF_USER_AGENT                            nombre de la app y un contacto REAL.
 *                                             Local: supabase/functions/.env
 *                                             Nube:  supabase secrets set …
 */

import { createClient } from 'npm:@supabase/supabase-js@2.116.0';

import {
  manejar,
  type Dependencias,
  type FilaCatalogo,
  type ProductoCatalogo,
} from '../_shared/lookup.ts';
import { consultarOff, type ProductoOff } from '../_shared/off.ts';

const url = Deno.env.get('SUPABASE_URL');
const claveServicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url || !claveServicio) {
  // Mejor no arrancar que arrancar sin poder comprobar a nadie.
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno de la función');
}

const admin = createClient(url, claveServicio, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

/**
 * Con qué se identifica la función ante Open Food Facts. Su política de uso pide un
 * User-Agent con el nombre de la app y un contacto, y es lo que les permite
 * escribirnos antes de bloquearnos. Sin uno bueno la función NO llama a OFF —sigue
 * sirviendo lo que ya está en la caché— en lugar de hacerlo anónimamente.
 *
 * Se rechaza el valor de ejemplo de `.env.example`: copiarlo sin cambiarlo es
 * identificarse con un correo que no existe.
 */
function leerUserAgent(): string | null {
  const valor = Deno.env.get('OFF_USER_AGENT')?.trim() ?? '';
  const valido = /^[\x20-\x7E]{8,200}$/.test(valor) && !/ejemplo\.com/i.test(valor);
  if (!valido) {
    console.log(
      JSON.stringify({
        evento: 'lookup-barcode',
        aviso: 'OFF_USER_AGENT sin configurar o con el valor de ejemplo: no se consultará Open Food Facts',
      }),
    );
    return null;
  }
  return valor;
}

const userAgentOff = leerUserAgent();

function aProducto(fila: Record<string, unknown>): ProductoCatalogo {
  return {
    id: String(fila.id),
    barcode: String(fila.barcode),
    name: String(fila.name),
    brand: (fila.brand as string | null) ?? null,
    unit_family: (fila.unit_family as ProductoCatalogo['unit_family']) ?? null,
    net_quantity: fila.net_quantity === null ? null : Number(fila.net_quantity),
    image_url: (fila.image_url as string | null) ?? null,
  };
}

const dependencias: Dependencias = {
  async verificarUsuario(token) {
    // GoTrue valida la firma, la caducidad y que la cuenta siga existiendo. La
    // `anon key` es un JWT con rol `anon` y sin `sub`: aquí no pasa.
    const { data, error } = await admin.auth.getUser(token);
    const usuario = data?.user;
    if (error || !usuario) return null;
    if (usuario.role !== 'authenticated' || usuario.is_anonymous === true) return null;
    return { id: usuario.id };
  },

  async consumirCuota(userId) {
    const { data, error } = await admin.rpc('consume_lookup_quota', { p_user_id: userId });
    if (error) throw error;
    const fila = (Array.isArray(data) ? data[0] : data) as
      | { permitido?: boolean; reintentar_en?: number }
      | null;
    // Si la respuesta no es la esperada se deniega: nunca se sigue sin contar.
    return { permitido: fila?.permitido === true, reintentarEn: Number(fila?.reintentar_en ?? 60) };
  },

  async buscarEnCatalogo(codigo): Promise<FilaCatalogo | null> {
    const { data, error } = await admin
      .from('products')
      .select('id, barcode, name, brand, unit_family, net_quantity, image_url, updated_at')
      .eq('barcode', codigo)
      .is('household_id', null)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...aProducto(data), updated_at: String(data.updated_at) } : null;
  },

  async esFaltaReciente(codigo) {
    const { data, error } = await admin.rpc('is_recent_barcode_miss', { p_barcode: codigo });
    if (error) throw error;
    return data === true;
  },

  async reservarHuecoOff() {
    const { data, error } = await admin.rpc('consume_off_slot');
    if (error) throw error;
    return data === true;
  },

  consultarOff,

  async guardar(codigo, producto: ProductoOff) {
    const { data, error } = await admin.rpc('upsert_global_product', {
      p_barcode: codigo,
      p_name: producto.name,
      p_brand: producto.brand,
      p_unit_family: producto.unitFamily,
      p_net_quantity: producto.netQuantity,
      p_image_url: producto.imageUrl,
      p_categories_tags: producto.categoriesTags,
      // Lo ya filtrado, no la respuesta cruda de OFF.
      p_payload: { ...producto, source: 'openfoodfacts', fetched_at: new Date().toISOString() },
    });
    if (error) throw error;
    return aProducto(data as Record<string, unknown>);
  },

  async registrarFalta(codigo) {
    const { error } = await admin.rpc('record_barcode_miss', { p_barcode: codigo });
    if (error) throw error;
  },

  log: (evento) => console.log(JSON.stringify(evento)),
  userAgentOff,
  ahora: () => Date.now(),
};

Deno.serve((req) => manejar(req, dependencias));

/**
 * Qué decir cuando la petición no llega a ningún sitio.
 *
 * «No se ha podido conectar» es cierto y no sirve de nada. Lo que hace falta
 * saber es CONTRA QUÉ se estaba intentando conectar, porque el fallo más común
 * con diferencia no es que Supabase esté apagado: es que la app del móvil
 * apunta a `127.0.0.1`, que desde el móvil es el propio móvil.
 *
 * Por eso el mensaje nombra la URL y cambia según sea local o de red.
 */

import { env } from './env';

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

/** Un fallo de red, no una respuesta del servidor. */
export function esFalloDeRed(mensaje: string): boolean {
  const lower = mensaje.toLowerCase();
  return (
    lower.includes('network request failed') ||
    lower.includes('failed to fetch') ||
    lower.includes('fetch failed') ||
    lower.includes('network error')
  );
}

export function mensajeSinConexion(): string {
  // Las pistas de abajo (`npm run up`, `app/.env`, el cortafuegos) son para quien
  // programa, y enseñan además la dirección del servidor. Una persona con la app
  // instalada no tiene nada de eso: solo necesita saber que es la conexión y qué
  // hacer. En un build de producción `__DEV__` es falso.
  if (!__DEV__) {
    return 'No hay conexión con Opsi. Mira que tienes internet e inténtalo de nuevo.';
  }

  const url = env.supabaseUrl;

  if (LOOPBACK.test(url)) {
    return (
      `No llego a ${url}.\n\n` +
      '· Si estás en el MÓVIL, esa dirección es el propio móvil. Pon la IP de tu ' +
      'ordenador en app/.env y reinicia Expo.\n' +
      '· Si estás en el navegador del ordenador, levántalo:  npm run up'
    );
  }

  return (
    `No llego a ${url}.\n\n` +
    '· ¿Está levantado?  npm run up\n' +
    '· ¿Sigue siendo esa la IP de tu ordenador? Cambia con la red.\n' +
    '· El cortafuegos puede estar bloqueando el puerto 54321.'
  );
}

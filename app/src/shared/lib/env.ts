/**
 * Configuración que llega desde el entorno.
 *
 * Todo lo que empieza por EXPO_PUBLIC_ SE INCRUSTA EN EL BINARIO y es legible
 * por cualquiera que descargue la app. Aquí solo va lo que es público por
 * diseño: la URL del proyecto y la `anon key`, que no protege nada por sí
 * misma — quien protege es la RLS.
 *
 * Se falla al arrancar, y no al primer intento de login, porque una app que
 * parece funcionar y revienta al autenticar es mucho peor de diagnosticar.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta ${name}. Copia .env.example a .env en la raíz del repositorio y ` +
        `rellénalo con lo que imprime "npm run db:status".`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
};

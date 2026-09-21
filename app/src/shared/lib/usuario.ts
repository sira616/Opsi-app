/**
 * El nombre de usuario, y el correo sintético que lo hace funcionar.
 *
 * Supabase Auth no sabe autenticar por nombre de usuario: solo por correo o
 * por teléfono. Así que cada usuario tiene un correo que no existe, derivado
 * del nombre, y es ese el que viaja a GoTrue:
 *
 *     syreta  →  syreta@usuarios.opsi.local
 *
 * El usuario no lo ve nunca. La regla vive por duplicado —aquí y en
 * `public.dominio_sintetico()`, en la migración 20260921160000— porque el
 * cliente tiene que construir el correo ANTES de tener sesión, que es
 * justo cuando no puede preguntarle nada a la base de datos.
 */

/** Debe coincidir con `public.dominio_sintetico()`. */
export const DOMINIO_SINTETICO = 'usuarios.opsi.local';

/** Debe coincidir con `user_settings_username_ck`. */
const FORMATO = /^[a-z0-9_]{3,20}$/;

export const USUARIO_MIN = 3;
export const USUARIO_MAX = 20;

/** Fijado en supabase/config.toml (auth.minimum_password_length). */
export const CONTRASENA_MIN = 10;

/**
 * Lo que se guarda es siempre esto: sin espacios y en minúsculas.
 *
 * Los teclados móviles ponen mayúscula a la primera letra por su cuenta, y
 * copiar y pegar arrastra espacios. Normalizar en la entrada evita que
 * «Syreta » y «syreta» acaben pareciendo dos cuentas distintas.
 */
export function normalizarUsuario(entrada: string): string {
  return entrada.trim().toLowerCase();
}

export function esUsuarioValido(usuario: string): boolean {
  return FORMATO.test(usuario);
}

/**
 * Por qué no vale, en una frase, o null si vale.
 *
 * Se devuelve el motivo concreto en vez de un «no es válido» genérico: el
 * usuario no puede adivinar cuál de las tres reglas ha roto.
 */
export function motivoUsuarioInvalido(usuario: string): string | null {
  if (usuario.length === 0) return null;
  if (usuario.length < USUARIO_MIN) return `Al menos ${USUARIO_MIN} caracteres.`;
  if (usuario.length > USUARIO_MAX) return `Como mucho ${USUARIO_MAX} caracteres.`;
  if (!FORMATO.test(usuario)) return 'Solo letras sin acentos, números y guion bajo.';
  return null;
}

/** El correo que se le da a GoTrue. Espera un usuario ya normalizado. */
export function correoSintetico(usuario: string): string {
  return `${usuario}@${DOMINIO_SINTETICO}`;
}

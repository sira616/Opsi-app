/**
 * Que no haya contraseñas escritas en el repositorio. Nunca.
 *
 *     npm run check:credenciales
 *
 * Existe por un fallo real: el seed de desarrollo llevaba una contraseña en claro
 * (`syreta` y `compi`), y el repositorio era público. Y el escáner de secretos NO lo
 * cazaba, porque se le había añadido una excepción para ese valor «a propósito». Una
 * puerta con una excepción para lo único que debía cazar no es una puerta.
 *
 * Lo que se comprueba, sobre los ficheros que git sigue:
 *
 *   1. **Contraseñas en SQL**: `crypt('literal', …)` o `v_password := 'literal'`. Una
 *      contraseña se genera (`gen_random_uuid()`) o viene de fuera, no se escribe.
 *   2. **«contraseña: valor»** o `password = valor` con un valor de verdad, en el seed, los
 *      ejemplos de entorno, el README y las guías.
 *   3. **Tablas de documentación** con una columna «Contraseña» y un valor dentro.
 *   4. **Las huellas de las contraseñas que ya estuvieron publicadas**: cualquier palabra
 *      de cualquier fichero cuyo SHA-256 coincida. La huella no revela la contraseña; solo
 *      impide que vuelva a escribirse.
 *   5. **Las excepciones del escáner de secretos** (`.gitleaks.toml`): solo vale la lista
 *      de abajo. Una nueva obliga a editar ESTE fichero a propósito, y que alguien lo vea.
 *
 * No sustituye a gitleaks (que caza claves de verdad); cubre lo que gitleaks no puede
 * saber: que un valor de aspecto inocente es una contraseña.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/** SHA-256 de contraseñas que estuvieron publicadas. Ya no valen: no pueden volver. */
const HUELLAS_PUBLICADAS = new Set([
  '8e294c24abec40b0ea73fd225cbcf980c8ae869d1f6b0a6951f3f92e14ea326c',
]);

/** Lo único que `.gitleaks.toml` puede ignorar: el secreto JWT por defecto de la CLI de Supabase (público). */
const EXENCIONES_PERMITIDAS = new Set(['super-secret-jwt-token-with-at-least-32-characters-long']);

/** Donde una contraseña con valor es siempre un fallo (la regla 2). */
const RUTAS_ESTRICTAS = [
  /^supabase\/seed\//,
  /^supabase\/.*\.env\.example$/,
  /^app\/\.env\.example$/,
  /^README\.md$/,
  /^docs\/SETUP\.md$/,
  /^docs\/MOVIL\.md$/,
  /^docs\/NATIVA\.md$/,
];

const SIN_TEXTO = /\.(png|jpe?g|gif|ico|webp|ttf|otf|woff2?|zip|jks|p12|p8)$|(^|\/)package-lock\.json$/i;

/** Un valor que no es una contraseña: un marcador, una variable, una instrucción. */
function esMarcador(valor) {
  return /^(<|\{|\$|\[|\(|\.\.\.|…|tu\b|la\b|el\b|una?\b|mínimo|minimo|x{3,}|\*{3,}|nunca|ninguna|aleatoria)/i.test(valor);
}

const fallos = [];
const fallo = (fichero, linea, motivo) => fallos.push(`  · ${fichero}:${linea}  ${motivo}`);

const ficheros = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !SIN_TEXTO.test(f));

for (const f of ficheros) {
  let texto;
  try {
    texto = readFileSync(join(RAIZ, f), 'utf8');
  } catch {
    continue;
  }
  if (texto.includes('\u0000')) continue;
  const lineas = texto.split(/\r?\n/);
  const estricta = RUTAS_ESTRICTAS.some((r) => r.test(f));
  const esEsteFichero = relative(RAIZ, fileURLToPath(import.meta.url)).replace(/\\/g, '/') === f;

  // 4. Las huellas de lo que ya estuvo publicado: en cualquier fichero.
  lineas.forEach((l, i) => {
    for (const palabra of l.match(/[A-Za-z0-9._!@#%^&*+-]{6,64}/g) ?? []) {
      if (HUELLAS_PUBLICADAS.has(createHash('sha256').update(palabra).digest('hex'))) {
        fallo(f, i + 1, 'una contraseña que ya estuvo publicada (aunque esté sin comillas ni etiqueta)');
      }
    }
  });
  if (esEsteFichero) continue;

  // 1. Contraseñas en SQL.
  if (/\.sql$/.test(f)) {
    lineas.forEach((l, i) => {
      if (/^\s*--/.test(l)) return;
      if (/\bcrypt\(\s*'[^']+'/i.test(l)) fallo(f, i + 1, "crypt('…') con la contraseña escrita");
      if (/\b\w*(password|contrasena|passwd)\w*\s+(text\s+)?:=\s*'[^']+'/i.test(l)) {
        fallo(f, i + 1, 'una contraseña asignada con un literal');
      }
    });
  }

  // 2. «contraseña: valor» / «password = valor».
  if (estricta) {
    lineas.forEach((l, i) => {
      for (const m of l.matchAll(/\b(contrase[ñn]a|password|passwd)\b\s*(?::|=)\s*[`'"]?([^\s`'"|,;)]{4,})/gi)) {
        if (!esMarcador(m[2])) fallo(f, i + 1, `«${m[1]}» con un valor escrito`);
      }
    });
  }

  // 3. Tablas de documentación con una columna «Contraseña».
  if (/\.md$/.test(f)) {
    for (let i = 0; i < lineas.length; i++) {
      const cabecera = lineas[i];
      if (!/^\s*\|/.test(cabecera) || !/contrase[ñn]a|password/i.test(cabecera)) continue;
      const celdas = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      // Solo una columna que SE LLAMA «Contraseña»: una tabla que habla de contraseñas
      // (los riesgos, las políticas) tiene la palabra dentro de frases, no como columna.
      const columna = celdas(cabecera).findIndex((c) => /^[`*_ ]*(contrase[ñn]a|password)[`*_ ]*$/i.test(c));
      if (columna < 0) continue;
      for (let j = i + 2; j < lineas.length && /^\s*\|/.test(lineas[j]); j++) {
        const valor = (celdas(lineas[j])[columna] ?? '').replace(/[`*_]/g, '');
        if (valor && !esMarcador(valor)) fallo(f, j + 1, 'una tabla con una contraseña escrita');
      }
    }
  }

  // 5. Las excepciones del escáner de secretos.
  if (f === '.gitleaks.toml') {
    for (const m of texto.matchAll(/'''([^']*)'''/g)) {
      if (!EXENCIONES_PERMITIDAS.has(m[1])) {
        const n = texto.slice(0, m.index).split('\n').length;
        fallo(f, n, 'una exención nueva del escáner de secretos: se añade a propósito en scripts/check-credenciales.mjs');
      }
    }
  }
}

if (fallos.length > 0) {
  console.error(`\nHay contraseñas (o excepciones para ellas) escritas en el repositorio:\n`);
  console.error(fallos.join('\n'));
  console.error(
    '\nUna contraseña no se escribe en git: se genera al azar (ver scripts/dev-cuentas.mjs) o viene de fuera.\n' +
      'Si una de verdad ya estuvo publicada, cambiarla y añadir su SHA-256 a HUELLAS_PUBLICADAS.\n',
  );
  process.exit(1);
}
console.log(`Sin contraseñas escritas en ${ficheros.length} ficheros.`);

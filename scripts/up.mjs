/**
 * Levanta el entorno entero con un solo comando.
 *
 *     npm run up
 *
 * Hace tres cosas, en orden:
 *   1. `supabase start` — Postgres, Auth, Storage y Studio en Docker.
 *   2. `supabase db reset` — aplica migraciones y seed.
 *   3. Escribe `app/.env` con la URL y la anon key que acaba de imprimir.
 *
 * El paso 3 es el motivo real de que este script exista. Copiar la anon key a
 * mano es el sitio donde más fácil se falla, y el síntoma —un error al
 * registrarse— no se parece en nada a la causa.
 *
 * Está en Node y no en un .sh a propósito: tiene que funcionar igual en
 * Windows, que es donde se está usando.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, 'app', '.env');

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

/**
 * La IP de este ordenador en la red local, que es la que necesita el móvil.
 *
 * Se descartan los adaptadores virtuales —Docker, WSL, VirtualBox, Hyper-V—
 * porque en Windows son legión y ninguno es alcanzable desde el móvil. De las
 * que quedan se prefiere 192.168.x.x, que es lo que reparte un router
 * doméstico.
 */
function ipLocal() {
  const candidatas = [];

  for (const [nombre, direcciones] of Object.entries(networkInterfaces())) {
    if (/veth|virtual|vbox|vmware|hyper-v|wsl|docker|loopback|tailscale|zerotier/i.test(nombre)) {
      continue;
    }
    for (const dir of direcciones ?? []) {
      if (dir.family !== 'IPv4' || dir.internal) continue;
      // 169.254.x.x es lo que se asigna un equipo cuando NO consigue IP.
      if (dir.address.startsWith('169.254.')) continue;
      candidatas.push({ nombre, ip: dir.address });
    }
  }

  const puntuar = ({ nombre, ip }) =>
    (ip.startsWith('192.168.') ? 100 : 0) +
    (/^10\./.test(ip) ? 50 : 0) +
    (/wi-?fi|wlan|wireless|inalámbric/i.test(nombre) ? 10 : 0) +
    (/ethernet|^en\d|^eth\d/i.test(nombre) ? 5 : 0);

  candidatas.sort((a, b) => puntuar(b) - puntuar(a));
  return candidatas[0]?.ip ?? null;
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * La CLI de Supabase, la fijada en package.json.
 *
 * Se añade node_modules/.bin al PATH en vez de confiar en que ya esté: npm lo
 * hace por ti cuando esto corre como `npm run up`, pero no si alguien lanza
 * `node scripts/up.mjs` a pelo, y entonces el fallo dice «supabase: not found»
 * y parece un problema de Docker cuando no lo es.
 */
const BIN = join(ROOT, 'node_modules', '.bin');

function supabase(args, { capture = false } = {}) {
  return spawnSync('supabase', args, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${BIN}${delimiter}${process.env.PATH ?? ''}` },
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
}

function step(n, text) {
  console.log(`\n${bold(`[${n}/3]`)} ${text}`);
}

function die(message, hint) {
  console.error(`\n${red('No se pudo continuar:')} ${message}`);
  if (hint) console.error(dim(`  ${hint}`));
  process.exit(1);
}

// ── 1. Arrancar ───────────────────────────────────────────────────────────
step(1, 'Levantando Supabase…');
console.log(dim('  La primera vez descarga varios GB de imágenes. Ten paciencia.'));

if (!existsSync(join(BIN, process.platform === 'win32' ? 'supabase.cmd' : 'supabase'))) {
  die('No encuentro la CLI de Supabase.', 'Ejecuta primero: npm install');
}

if (supabase(['start']).status !== 0) {
  die(
    'supabase start ha fallado.',
    '¿Está Docker Desktop abierto? Compruébalo con: docker ps',
  );
}

// ── 2. Migraciones y seed ─────────────────────────────────────────────────
step(2, 'Aplicando migraciones y datos de ejemplo…');

if (supabase(['db', 'reset']).status !== 0) {
  die('supabase db reset ha fallado.', 'El error de arriba dice qué migración lo rompió.');
}

// ── 3. Escribir app/.env ──────────────────────────────────────────────────
step(3, 'Configurando app/.env…');

const status = supabase(['status', '-o', 'env'], { capture: true });
if (status.status !== 0 || !status.stdout) {
  die('No se ha podido leer el estado de Supabase.');
}

// Se buscan por patrón y no por nombre exacto: las etiquetas de la CLI han
// cambiado entre versiones, y fallar aquí por un renombrado sería absurdo.
const vars = new Map();
for (const line of status.stdout.split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (match) vars.set(match[1], match[2]);
}

const findVar = (re) => {
  for (const [key, value] of vars) if (re.test(key) && value) return value;
  return null;
};

const apiUrl = findVar(/^API_URL$/) ?? findVar(/API.*URL/);
const anonKey = findVar(/^ANON_KEY$/) ?? findVar(/ANON/);

if (!apiUrl || !anonKey) {
  console.error(dim(`\n  Lo que devolvió la CLI:\n${status.stdout}`));
  die('No encuentro la URL o la anon key en la salida de "supabase status".');
}

// Lo que ya hubiera en el fichero se respeta; solo se reescriben estas dos.
const previous = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const keep = previous
  .split('\n')
  .filter(
    (line) =>
      line.trim() &&
      !line.startsWith('EXPO_PUBLIC_SUPABASE_URL=') &&
      !line.startsWith('EXPO_PUBLIC_SUPABASE_ANON_KEY='),
  );

/**
 * Si ya habías puesto una URL que NO es 127.0.0.1, se respeta.
 *
 * Esto costó una sesión de depuración: quien prueba en el móvil cambia la URL
 * por la IP de su ordenador, y el siguiente `npm run up` se la machacaba. El
 * síntoma —«no se puede conectar» solo en el móvil, y justo después de
 * actualizar— no se parece nada a su causa.
 */
const urlPrevia = previous.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const personalizada = urlPrevia && !LOOPBACK.test(urlPrevia) ? urlPrevia : null;
const urlFinal = personalizada ?? apiUrl;

writeFileSync(
  ENV_FILE,
  [
    '# Escrito por "npm run up". Se puede editar: solo se reescriben estas dos.',
    '#',
    '# Para probar en un MÓVIL FÍSICO, cambia 127.0.0.1 por la IP local de este',
    '# ordenador (ipconfig en Windows): desde el móvil, 127.0.0.1 es el móvil.',
    `EXPO_PUBLIC_SUPABASE_URL=${urlFinal}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    ...keep,
    '',
  ].join('\n'),
);

if (personalizada) {
  console.log(green(`  ✓ app/.env actualizado. Se respeta tu URL: ${personalizada}`));
} else {
  console.log(green('  ✓ app/.env escrito con la URL y la anon key de este arranque.'));
}

// ── Resumen ───────────────────────────────────────────────────────────────
const studio = findVar(/STUDIO/) ?? 'http://127.0.0.1:54323';
const mail = findVar(/INBUCKET|MAILPIT/);

console.log(`\n${green(bold('Todo levantado.'))}\n`);
console.log(`  API      ${apiUrl}`);
console.log(`  Studio   ${studio}`);
if (mail) console.log(`  Correo   ${mail}`);
// El móvil no puede llegar a 127.0.0.1, así que si la URL apunta ahí hay que
// decirlo ANTES de que lo descubra con un error que no explica nada.
if (!personalizada) {
  const ip = ipLocal();
  console.log(`\n${bold('Para probar en el MÓVIL')} ${dim('(desde el móvil, 127.0.0.1 es el móvil)')}`);
  if (ip) {
    console.log(`  Edita app/.env y pon:`);
    console.log(`  ${green(`EXPO_PUBLIC_SUPABASE_URL=http://${ip}:54321`)}`);
    console.log(dim('  Luego reinicia Expo. Los próximos "npm run up" ya no lo tocarán.'));
  } else {
    console.log(dim('  No he sabido deducir la IP de este ordenador. Mírala con ipconfig.'));
  }
}

console.log(`\n${bold('Ahora:')}`);
console.log('  npm run app:web      abre la app en el navegador');
console.log('  npm run app          QR para Expo Go en el móvil');
console.log('  npm run db:test      los tests de aislamiento');
console.log(`\n${dim('Para pararlo todo: npm run db:stop')}\n`);

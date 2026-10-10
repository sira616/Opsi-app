/**
 * Puerta de dependencias: falla si hay un aviso de seguridad ALTO o CRÍTICO sin
 * una exención vigente.
 *
 *     npm run check:audit
 *
 * ── Por qué no basta con `npm audit --audit-level=high` ─────────────────────
 *
 * Hoy sale en rojo, y lo estaría siempre: casi todo lo que marca es la cadena de
 * herramientas de Expo (Metro, Expo CLI), que no va dentro de la app, y los
 * «arreglos» que sugiere son bajar a versiones de hace años. Una puerta que
 * falla siempre acaba ignorada, y entonces deja de vigilar también lo que sí
 * importa. Esta falla solo ante lo NUEVO y obliga a decidir sobre lo que ya hay.
 *
 * ── Cómo funcionan las exenciones ───────────────────────────────────────────
 *
 * Viven en `docs/security-waivers.json`, una por aviso (por su GHSA, no por
 * paquete: eximir un paquete entero taparía los avisos que lleguen mañana), con
 * el motivo y una FECHA LÍMITE. Pasada la fecha la exención deja de valer y la
 * puerta vuelve a fallar: no hay exenciones permanentes. Es lo que pide la
 * sección C3 y C5 de la lista de seguridad.
 *
 * Falla CERRADO: si `npm audit` no puede consultar el registro (sin red), esto
 * sale con error en vez de dar el visto bueno por no haber visto nada.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXENCIONES = join(ROOT, 'docs', 'security-waivers.json');
const GRAVES = new Set(['high', 'critical']);

const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const ambar = (s) => `\x1b[33m${s}\x1b[0m`;
const tenue = (s) => `\x1b[2m${s}\x1b[0m`;

// ── 1 · Lo que dice npm ─────────────────────────────────────────────────────
// Comando entero y con shell: `npm` es `npm.cmd` en Windows y Node ya no lanza un
// .cmd sin shell. Pasar además los argumentos aparte con `shell: true` hace que
// Node avise (DEP0190) de que no se escapan; aquí son constantes, pero así no hay
// aviso.
const resultado = spawnSync('npm audit --json', {
  cwd: ROOT,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

let informe;
try {
  informe = JSON.parse(resultado.stdout);
} catch {
  console.error(rojo('\nNo he podido leer la salida de `npm audit`.'));
  console.error(tenue(`  ${(resultado.stderr || resultado.stdout || 'sin salida').split('\n')[0]}`));
  process.exit(2);
}

if (informe.error || !informe.vulnerabilities) {
  console.error(rojo('\n`npm audit` no ha podido consultar el registro.'));
  console.error(tenue(`  ${informe.error?.summary ?? informe.error?.code ?? 'sin detalle'}`));
  console.error(tenue('  Falla cerrado: sin saber qué hay, no se da por bueno.'));
  process.exit(2);
}

// Un aviso aparece como objeto en el `via` del paquete que lo sufre, y como
// simple nombre en los paquetes que dependen de ese. Solo cuentan los objetos.
const avisos = new Map();
for (const paquete of Object.values(informe.vulnerabilities)) {
  for (const via of paquete.via ?? []) {
    if (typeof via !== 'object' || !GRAVES.has(via.severity)) continue;
    const id = (via.url ?? '').split('/').pop() || String(via.source);
    if (!avisos.has(id)) {
      avisos.set(id, { id, paquete: via.name, gravedad: via.severity, titulo: via.title ?? '' });
    }
  }
}

// ── 2 · Las exenciones ──────────────────────────────────────────────────────
const exenciones = existsSync(EXENCIONES) ? JSON.parse(readFileSync(EXENCIONES, 'utf8')) : [];
const hoy = new Date().toISOString().slice(0, 10);
const porId = new Map(exenciones.map((e) => [e.id, e]));

// ── 3 · El veredicto ────────────────────────────────────────────────────────
console.log(`\nAvisos altos y críticos: ${avisos.size}\n`);

const fallos = [];
for (const aviso of [...avisos.values()].sort((a, b) => (a.gravedad === 'critical' ? -1 : 1) - (b.gravedad === 'critical' ? -1 : 1))) {
  const exencion = porId.get(aviso.id);
  const etiqueta = `${aviso.gravedad.padEnd(8)} ${aviso.id}  ${aviso.paquete}`;

  if (!exencion) {
    fallos.push(`${aviso.id} (${aviso.paquete}) no tiene exención`);
    console.log(`  ${rojo('✗')} ${etiqueta}\n      ${tenue(aviso.titulo.slice(0, 90))}\n      ${rojo('sin exención: arréglalo o exímelo en docs/security-waivers.json con motivo y fecha')}`);
  } else if (exencion.hasta < hoy) {
    fallos.push(`la exención de ${aviso.id} caducó el ${exencion.hasta}`);
    console.log(`  ${rojo('✗')} ${etiqueta}\n      ${rojo(`la exención caducó el ${exencion.hasta}: hay que revisarla`)}`);
  } else {
    console.log(`  ${ambar('~')} ${etiqueta}  ${tenue(`exento hasta ${exencion.hasta}`)}`);
  }
}

// Exenciones que ya no corresponden a nada: se avisa, no se falla. Suele
// significar que el aviso se arregló y la línea sobra.
for (const exencion of exenciones) {
  if (!avisos.has(exencion.id)) {
    console.log(`  ${tenue(`· sobra la exención de ${exencion.id}: ya no sale en el informe`)}`);
  }
}

if (fallos.length > 0) {
  console.log(`\n${rojo(`${fallos.length} problema(s):`)}\n${fallos.map((f) => `  · ${f}`).join('\n')}`);
  process.exit(1);
}

console.log(`\n${verde('Sin avisos graves fuera de las exenciones vigentes.')}`);

/**
 * Verifica la paleta de Opsi contra WCAG 2.1 AA.
 *
 *     npm run check:contrast
 *
 * Lee los colores DIRECTAMENTE de app/src/shared/theme/tokens.ts, que es donde
 * los usa la app. Tener aquí una copia era pedir que las dos se separaran, y
 * se separaron: la primera versión de este script daba todo por bueno mientras
 * la app usaba otros valores.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'shared', 'theme', 'tokens.tsx');

/** Saca `const NOMBRE: Palette = { … }` del fichero de tokens. */
function leerPaleta(fuente, nombre) {
  const inicio = fuente.indexOf(`const ${nombre}: Palette = {`);
  if (inicio === -1) throw new Error(`No encuentro la paleta ${nombre} en tokens.ts`);
  const fin = fuente.indexOf('};', inicio);
  const cuerpo = fuente.slice(inicio, fin);

  const paleta = {};
  for (const [, clave, valor] of cuerpo.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) {
    paleta[clave] = valor;
  }
  return paleta;
}

/**
 * Los colores base premium: `PALETAS_ACENTO` en tokens.tsx. Se pegan sobre la paleta
 * base y se comprueba el conjunto, que es lo que la app pinta de verdad.
 */
function leerAcentos(fuente) {
  const inicio = fuente.indexOf('const PALETAS_ACENTO');
  if (inicio === -1) throw new Error('No encuentro PALETAS_ACENTO en tokens.tsx');
  const fin = fuente.indexOf('\n};', inicio);
  const cuerpo = fuente.slice(inicio, fin);
  const acentos = {};
  const bloque = /(\w+):\s*\{\s*claro:\s*\{([^}]*)\},\s*oscuro:\s*\{([^}]*)\},?\s*\}/g;
  for (const [, nombre, claro, oscuro] of cuerpo.matchAll(bloque)) {
    const leer = (texto) =>
      Object.fromEntries([...texto.matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)].map(([, k, v]) => [k, v]));
    acentos[nombre] = { claro: leer(claro), oscuro: leer(oscuro) };
  }
  return acentos;
}

// ── Contraste WCAG ────────────────────────────────────────────────────────
const canales = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lineal = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = (h) => {
  const [r, g, b] = canales(h).map(lineal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const l1 = luminancia(a);
  const l2 = luminancia(b);
  const [alto, bajo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (bajo + 0.05);
};

/**
 * Cada pareja que la app pinta de verdad.
 *
 * 4.5:1 para texto, 3:1 para bordes de controles, que es lo que pide la norma
 * para elementos de interfaz no textuales.
 */
function casos(p, conEscala = false) {
  return [
    ['texto principal sobre el fondo', p.ink, p.ground, 4.5],
    ['texto principal sobre tarjeta', p.ink, p.surface, 4.5],
    ['texto secundario sobre el fondo', p.inkMuted, p.ground, 4.5],
    ['texto secundario sobre tarjeta', p.inkMuted, p.surface, 4.5],
    ['nota de 11px sobre tarjeta', p.inkFaint, p.surface, 4.5],
    ['marca sobre el fondo', p.brand, p.ground, 4.5],
    ['marca sobre tarjeta', p.brand, p.surface, 4.5],
    ['texto sobre un relleno de marca', p.onBrand, p.brand, 4.5],
    ['texto de marca sobre su fondo suave', p.brandInk, p.brandSoft, 4.5],
    ['caducidad sobre tarjeta', p.expiry, p.surface, 4.5],
    ['texto de caducidad sobre su fondo', p.expiryInk, p.expirySoft, 4.5],
    ['borde de caducidad sobre su fondo', p.expiryLine, p.expirySoft, 3.0],
    ['aviso sobre tarjeta', p.warning, p.surface, 4.5],
    ['texto sobre el fondo de aviso', p.inkMuted, p.warningSoft, 4.5],
    ['icono de aviso sobre su fondo', p.warning, p.warningSoft, 3.0],
    ['congelado sobre tarjeta', p.frost, p.surface, 4.5],
    ['texto de congelado sobre su fondo', p.frostInk, p.frostSoft, 4.5],
    ['icono de congelado sobre su fondo', p.frost, p.frostSoft, 3.0],
    ['texto sobre el fondo de congelado', p.ink, p.frostSoft, 4.5],
    ['nota sobre el fondo de congelado', p.inkMuted, p.frostSoft, 4.5],
    ['borde de control sobre tarjeta', p.borderStrong, p.surface, 3.0],
    ...(conEscala ? casosEscala(p) : []),
  ];
}

/**
 * La escala del Nutri-Score (A a E). La letra de cada ficha sobre su relleno llega a 4.5:1.
 * La forma contra el fondo la da el borde grueso de la ficha activa, no el relleno: un
 * amarillo o un lima sobre blanco no llegan a 3:1 por sí solos, y por eso la ficha activa
 * nunca va sin su borde. La letra de una ficha apagada (neutra, sin color) también cuenta.
 *
 * Solo se comprueba con la paleta base: los colores premium cambian la marca y nada de esto.
 */
function casosEscala(p) {
  return [
    ...['A', 'B', 'C', 'D', 'E'].map((g) => [
      `letra de la ficha ${g} del Nutri-Score`,
      p[`nutri${g}Ink`],
      p[`nutri${g}`],
      4.5,
    ]),
    ['borde de la activa sobre tarjeta', p.nutriBorder, p.surface, 3.0],
    ['borde de la activa sobre el fondo', p.nutriBorder, p.ground, 3.0],
    ['letra de una ficha apagada', p.inkMuted, p.surfaceAlt, 4.5],
  ];
}

// ── La E no puede parecer caducidad ───────────────────────────────────────
//
// El rojo es SOLO de la caducidad (docs/DISENO.md). La ficha E del Nutri-Score es un naranja,
// y no basta con que no reutilice los tokens: tiene que quedar lejos en matiz de todo el
// rojo de caducidad, relleno, texto y borde incluidos. 15° es el mínimo que pide el diseño.
const MATIZ_MINIMO = 15;
const TOKENS_DE_CADUCIDAD = ['expiry', 'expirySoft', 'expiryInk', 'expiryLine'];

/** Matiz HSL en grados, de 0 a 360. */
function matiz(h) {
  const [r, g, b] = canales(h);
  const alto = Math.max(r, g, b);
  const delta = alto - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sector = alto === r ? ((g - b) / delta) % 6 : alto === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sector * 60 + 360) % 360;
}

/** La distancia más corta entre dos matices, dando la vuelta al círculo. */
function distanciaDeMatiz(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function comprobar(titulo, paleta, conEscala = false) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
  let fallos = 0;
  for (const [etiqueta, fg, bg, minimo] of casos(paleta, conEscala)) {
    if (!fg || !bg) {
      console.log(`  \x1b[31m✗\x1b[0m ${etiqueta.padEnd(38)} falta un color en la paleta`);
      fallos++;
      continue;
    }
    const r = contraste(fg, bg);
    const bien = r >= minimo;
    if (!bien) fallos++;
    console.log(
      `  ${bien ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${etiqueta.padEnd(38)} ${r.toFixed(2)}:1  (mín ${minimo})`,
    );
  }
  if (conEscala) fallos += comprobarMatizDeLaE(paleta);
  return fallos;
}

/** Cada token de caducidad tiene que quedar a `MATIZ_MINIMO` grados o más del naranja de la E. */
function comprobarMatizDeLaE(paleta) {
  if (!paleta.nutriE) {
    console.log('  \x1b[31m✗\x1b[0m falta nutriE en la paleta');
    return 1;
  }
  let fallos = 0;
  const e = matiz(paleta.nutriE);
  for (const token of TOKENS_DE_CADUCIDAD) {
    if (!paleta[token]) {
      console.log(`  \x1b[31m✗\x1b[0m falta ${token} en la paleta`);
      fallos++;
      continue;
    }
    const d = distanciaDeMatiz(e, matiz(paleta[token]));
    const bien = d >= MATIZ_MINIMO;
    if (!bien) fallos++;
    console.log(
      `  ${bien ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${`la E lejos de ${token} (matiz)`.padEnd(38)} ${d.toFixed(1)}°  (mín ${MATIZ_MINIMO}°)`,
    );
  }
  return fallos;
}

const fuente = readFileSync(TOKENS, 'utf8');
const claro = leerPaleta(fuente, 'CLARO');
const oscuro = leerPaleta(fuente, 'OSCURO');
let fallos = comprobar('MODO CLARO', claro, true) + comprobar('MODO OSCURO', oscuro, true);

const acentos = leerAcentos(fuente);
if (Object.keys(acentos).length !== 6) {
  throw new Error(`Esperaba 6 colores premium y leí ${Object.keys(acentos).length}`);
}
for (const [nombre, { claro: c, oscuro: o }] of Object.entries(acentos)) {
  fallos += comprobar(`COLOR ${nombre.toUpperCase()} · claro`, { ...claro, ...c });
  fallos += comprobar(`COLOR ${nombre.toUpperCase()} · oscuro`, { ...oscuro, ...o });
}

console.log(
  fallos === 0
    ? '\n\x1b[32m\x1b[1mLa paleta cumple WCAG AA.\x1b[0m\n'
    : `\n\x1b[31m\x1b[1m${fallos} combinaciones por debajo del mínimo.\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);

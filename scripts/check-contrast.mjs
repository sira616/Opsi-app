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

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'src', 'shared', 'theme', 'tokens.ts');

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
function casos(p) {
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
    ['congelado sobre tarjeta', p.frost, p.surface, 4.5],
    ['borde de control sobre tarjeta', p.borderStrong, p.surface, 3.0],
  ];
}

function comprobar(titulo, paleta) {
  console.log(`\n\x1b[1m${titulo}\x1b[0m`);
  let fallos = 0;
  for (const [etiqueta, fg, bg, minimo] of casos(paleta)) {
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
  return fallos;
}

const fuente = readFileSync(TOKENS, 'utf8');
const fallos =
  comprobar('MODO CLARO', leerPaleta(fuente, 'CLARO')) +
  comprobar('MODO OSCURO', leerPaleta(fuente, 'OSCURO'));

console.log(
  fallos === 0
    ? '\n\x1b[32m\x1b[1mLa paleta cumple WCAG AA.\x1b[0m\n'
    : `\n\x1b[31m\x1b[1m${fallos} combinaciones por debajo del mínimo.\x1b[0m\n`,
);
process.exit(fallos === 0 ? 0 : 1);

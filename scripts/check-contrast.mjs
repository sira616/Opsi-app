// Validador de contraste WCAG 2.1 para la paleta de Opsi.
const hex = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
const L = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const l1 = L(a), l2 = L(b); const [hi,lo] = l1>l2 ? [l1,l2] : [l2,l1]; return (hi+0.05)/(lo+0.05); };

const CLARO = {
  bg:        '#F6F5F2',
  surface:   '#FFFFFF',
  surfaceAlt:'#EFEDE7',
  line:      '#E3E0D8',
  lineStrong:'#9D947F',
  ink:       '#16181A',
  inkMuted:  '#5F6470',
  inkFaint:  '#717683',
  brand:     '#0A7D56',
  brandInk:  '#08694A',
  brandSoft: '#DDF5EB',
  expiry:    '#C23B2B',
  expiryInk: '#8F2B1E',
  expirySoft:'#FBE8E4',
  warn:      '#A46718',
  warnSoft:  '#FBF0DC',
  frost:     '#2A7BB8',
  frostSoft: '#E2F0FA',
};

const OSCURO = {
  bg:        '#111316',
  surface:   '#1B1E22',
  surfaceAlt:'#23272C',
  line:      '#2E3339',
  lineStrong:'#616974',
  ink:       '#F2F3F5',
  inkMuted:  '#A8AFBA',
  inkFaint:  '#7F8690',
  brand:     '#34D399',
  brandInk:  '#0C231B',
  brandSoft: '#16302A',
  expiry:    '#FF8A75',
  expiryInk: '#2E1512',
  expirySoft:'#33201D',
  warn:      '#F2B65A',
  warnSoft:  '#312716',
  frost:     '#7CC4F2',
  frostSoft: '#17262F',
};

function comprobar(nombre, P, oscuro) {
  console.log(`\n\x1b[1m${nombre}\x1b[0m`);
  const casos = [
    ['texto principal sobre fondo',      P.ink, P.bg,        4.5],
    ['texto principal sobre tarjeta',    P.ink, P.surface,   4.5],
    ['texto secundario sobre fondo',     P.inkMuted, P.bg,   4.5],
    ['texto secundario sobre tarjeta',   P.inkMuted, P.surface, 4.5],
    ['texto tenue sobre tarjeta (11px)', P.inkFaint, P.surface, 4.5],
    ['marca sobre fondo',                P.brand, P.bg,      4.5],
    ['marca sobre tarjeta',              P.brand, P.surface,  4.5],
    ['texto sobre relleno de marca',     oscuro ? P.brandInk : '#FFFFFF', P.brand, 4.5],
    ['caducidad sobre tarjeta',          P.expiry, P.surface, 4.5],
    ['caducidad sobre su fondo suave',   oscuro ? P.expiry : P.expiryInk, P.expirySoft, 4.5],
    ['aviso sobre tarjeta',              P.warn, P.surface,   4.5],
    ['congelado sobre tarjeta',          P.frost, P.surface,  4.5],
    ['marca sobre su fondo suave',       oscuro ? P.brand : P.brandInk, P.brandSoft, 4.5],
    ['borde fuerte sobre tarjeta (UI)',  P.lineStrong, P.surface, 3.0],
  ];
  let fallos = 0;
  for (const [etiqueta, fg, bg, min] of casos) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) fallos++;
    console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${etiqueta.padEnd(36)} ${r.toFixed(2)}:1  (mín ${min})`);
  }
  return fallos;
}

const f = comprobar('MODO CLARO', CLARO, false) + comprobar('MODO OSCURO', OSCURO, true);
console.log(f === 0 ? '\n\x1b[32m\x1b[1mTodo cumple WCAG AA.\x1b[0m\n' : `\n\x1b[31m\x1b[1m${f} combinaciones por debajo del mínimo.\x1b[0m\n`);

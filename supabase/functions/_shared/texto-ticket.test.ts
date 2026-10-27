import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  claveDeLinea,
  claveDeTienda,
  compararTamanos,
  extraerTamano,
  motivoNoProducto,
  normalizarTexto,
  palabras,
  palabrasCoinciden,
  quitarImporteFinal,
} from './texto-ticket.ts';

// ── Normalizar ────────────────────────────────────────────────────────────

test('normalizar quita mayúsculas, acentos y puntuación, pero deja las cifras y las unidades', () => {
  assert.equal(normalizarTexto('  LECHE   Entera, 1,5 L. '), 'leche entera 1.5 l');
  assert.equal(normalizarTexto('Piña Colada 0%'), 'pina colada 0%');
  assert.equal(normalizarTexto('Q.BURGOS DESNA 250G'), 'q burgos desna 250g');
  assert.equal(normalizarTexto('Yogur  natural – x4'), 'yogur natural x4');
});

test('los decimales siguen pegados y un punto de abreviatura no', () => {
  assert.equal(normalizarTexto('0,750 kg'), '0.750 kg');
  assert.equal(normalizarTexto('pan.integral'), 'pan integral');
});

test('el importe del final no es parte de la clave, pero un peso sí', () => {
  assert.equal(claveDeLinea('LECHE ENTERA 1L 0,89'), claveDeLinea('LECHE ENTERA 1L'));
  assert.equal(claveDeLinea('LECHE ENTERA 1L 0,89 EUR'), claveDeLinea('LECHE ENTERA 1L'));
  assert.equal(claveDeLinea('2 x 1,25 PAN 2,50'), '2 x 1.25 pan');
  assert.notEqual(claveDeLinea('JAMON 0,750 KG'), claveDeLinea('JAMON'));
  assert.equal(quitarImporteFinal('pan 1.25'), 'pan');
  assert.equal(quitarImporteFinal('pan 125'), 'pan 125');
});

test('la clave de una línea conserva lo que separa productos parecidos', () => {
  assert.notEqual(claveDeLinea('LECHE ENTERA 1L'), claveDeLinea('LECHE ENTERA 200ML'));
  assert.notEqual(claveDeLinea('LECHE ENTERA'), claveDeLinea('LECHE ENTERA SIN LACTOSA'));
  assert.equal(claveDeLinea('Leche  ENTERA 1L'), claveDeLinea('leche entera 1l'));
  assert.equal(claveDeLinea('   '), '');
  assert.ok(claveDeLinea('a'.repeat(500)).length <= 160);
});

// ── Tamaños ───────────────────────────────────────────────────────────────

test('se lee el tamaño en litros, mililitros, gramos y kilos', () => {
  const casos: [string, string, number][] = [
    ['leche entera 1l', 'volume', 1000],
    ['leche 1.5 l', 'volume', 1500],
    ['refresco 330ml', 'volume', 330],
    ['refresco 33cl', 'volume', 330],
    ['queso 250g', 'mass', 250],
    ['harina 1 kg', 'mass', 1000],
    ['jamon 0.750 kg', 'mass', 750],
    ['huevos 12 uds', 'count', 12],
  ];
  for (const [texto, familia, total] of casos) {
    const { tamano } = extraerTamano(normalizarTexto(texto));
    assert.equal(tamano?.familia, familia, texto);
    assert.equal(tamano?.total, total, texto);
  }
});

test('un pack guarda el total y lo que trae cada unidad', () => {
  const a = extraerTamano('yogur natural 4x125g').tamano;
  assert.deepEqual(a, { familia: 'mass', total: 500, porUnidad: 125 });
  const b = extraerTamano('cerveza 6x33cl').tamano;
  assert.deepEqual(b, { familia: 'volume', total: 1980, porUnidad: 330 });
  assert.deepEqual(extraerTamano('yogur natural x4').tamano, { familia: 'count', total: 4, porUnidad: null });
  assert.deepEqual(extraerTamano('atun claro pack 6').tamano, { familia: 'count', total: 6, porUnidad: null });
});

test('el tamaño sale del texto para que no cuente como una palabra', () => {
  assert.equal(extraerTamano('leche entera 1l pascual').resto, 'leche entera pascual');
  assert.equal(extraerTamano('leche entera').tamano, null);
});

test('lo que no es un tamaño no lo parece', () => {
  assert.equal(extraerTamano('leche 2').tamano, null);
  assert.equal(extraerTamano('vitamina d').tamano, null);
  // «x 125» sin unidad no es un pack de 125.
  assert.equal(extraerTamano('galletas x 125').tamano, null);
  assert.equal(extraerTamano('coca cola zero').tamano, null);
});

test('2 L no es 330 ml, aunque se llamen igual; una unidad del pack sí vale', () => {
  const dosLitros = extraerTamano('refresco 2l').tamano;
  assert.equal(compararTamanos(dosLitros, { familia: 'volume', total: 330 }), 'distinto');
  assert.equal(compararTamanos(dosLitros, { familia: 'volume', total: 2000 }), 'igual');
  assert.equal(compararTamanos(dosLitros, { familia: 'volume', total: 1990 }), 'igual'); // 2 % de margen
  assert.equal(compararTamanos(dosLitros, { familia: 'mass', total: 2000 }), 'distinto');
  // Piezas contra peso: no se contradicen, simplemente no se sabe.
  const pack6 = extraerTamano('atun claro pack 6').tamano;
  assert.equal(compararTamanos(pack6, { familia: 'mass', total: 312 }), 'desconocido');
  assert.equal(compararTamanos(pack6, { familia: 'count', total: 6 }), 'igual');
  assert.equal(compararTamanos(pack6, { familia: 'count', total: 3 }), 'distinto');
  assert.equal(compararTamanos(dosLitros, null), 'desconocido');
  assert.equal(compararTamanos(null, { familia: 'volume', total: 2000 }), 'desconocido');
  const pack = extraerTamano('cerveza 6x33cl').tamano;
  assert.equal(compararTamanos(pack, { familia: 'volume', total: 330 }), 'igual');
  assert.equal(compararTamanos(pack, { familia: 'volume', total: 1980 }), 'igual');
  assert.equal(compararTamanos(pack, { familia: 'volume', total: 500 }), 'distinto');
});

// ── Palabras ──────────────────────────────────────────────────────────────

test('las palabras expanden abreviaturas y quitan solo las vacías', () => {
  assert.deepEqual(palabras('q burgos desna'), ['queso', 'burgos', 'desnatado']);
  assert.deepEqual(palabras('leche de vaca sin lactosa'), ['leche', 'vaca', 'sin', 'lactosa']);
  assert.deepEqual(palabras('coca cola 0%'), ['coca', 'cola', '0%']);
});

test('dos palabras coinciden si son iguales, plural o el principio de otra', () => {
  assert.equal(palabrasCoinciden('leche', 'leche'), true);
  assert.equal(palabrasCoinciden('huevo', 'huevos'), true);
  assert.equal(palabrasCoinciden('desna', 'desnatado'), true);
  assert.equal(palabrasCoinciden('sal', 'salmon'), false);
  assert.equal(palabrasCoinciden('pan', 'panceta'), false);
  assert.equal(palabrasCoinciden('0%', '0%'), true);
  assert.equal(palabrasCoinciden('1.5', '1.50'), false);
});

// ── Líneas que no son productos ───────────────────────────────────────────

test('los subtotales, los totales y el IVA no son productos', () => {
  const lineas = ['SUBTOTAL 23,45', 'TOTAL A PAGAR 23,45 EUR', 'Total 23,45', 'IVA 10% 2,13', 'BASE IMPONIBLE 21,32', 'IMPORTE: 23,45'];
  for (const l of lineas) assert.notEqual(motivoNoProducto(l), null, l);
  assert.equal(motivoNoProducto('SUBTOTAL 23,45'), 'total');
  assert.equal(motivoNoProducto('IVA 10% 2,13'), 'impuesto');
});

test('los descuentos y las promociones no son productos', () => {
  const lineas = ['DTO 2ª UNIDAD -0,45', 'DESCUENTO CLUB -1,20', 'PROMO 3X2 -2,10', 'AHORRO TOTAL 3,40', 'CUPON DESCUENTO -1,00'];
  for (const l of lineas) assert.equal(motivoNoProducto(l), 'descuento', l);
});

test('el pago y los mensajes del recibo no son productos', () => {
  const pago = ['TARJETA BANCARIA 23,45', 'EFECTIVO 30,00', 'CAMBIO 6,55', 'ENTREGADO 30,00', 'VISA CONTACTLESS 23,45'];
  for (const l of pago) assert.equal(motivoNoProducto(l), 'pago', l);
  const mensajes = ['GRACIAS POR SU VISITA', 'LE ATENDIO: MARIA', 'FACTURA SIMPLIFICADA Nº 1234', 'CONSERVE ESTE TICKET', 'PUNTOS ACUMULADOS 120'];
  for (const l of mensajes) assert.equal(motivoNoProducto(l), 'mensaje', l);
  assert.equal(motivoNoProducto('12,50'), 'solo_importe');
  assert.equal(motivoNoProducto('-0,45'), 'solo_importe');
});

test('un producto cuyo nombre se parece a una palabra de recibo sigue siendo un producto', () => {
  const productos = [
    'TOTAL 0% NATURAL', // el yogur griego
    'YOGUR TOTAL 0% 500G',
    'SALSA TIPO BARBACOA',
    'CAJA DE BOMBONES',
    'TARJETA REGALO CAFE',
    'LECHE ENTERA 1L',
    'COLA CAO ORIGINAL 383G',
    'VALE DE JAMON SERRANO', // no pasa nada por ser raro: no es solo "vale"
    'DESCALCIFICADOR CAFETERA',
    'PAN INTEGRAL',
  ];
  for (const p of productos) assert.equal(motivoNoProducto(p), null, p);
  assert.equal(motivoNoProducto(''), null);
});

// ── La tienda ─────────────────────────────────────────────────────────────

test('se reconocen las cadenas por su nombre impreso, con razón social y todo', () => {
  assert.equal(claveDeTienda('MERCADONA, S.A.'), 'mercadona');
  assert.equal(claveDeTienda('Lidl Supermercados S.A.U.'), 'lidl');
  assert.equal(claveDeTienda('SUPERMERCADOS DIA S.A.'), 'dia');
  assert.equal(claveDeTienda('Carrefour Market'), 'carrefour');
  assert.equal(claveDeTienda('El Corte Inglés'), 'el corte ingles');
  assert.equal(claveDeTienda('Hipercor'), 'el corte ingles');
});

test('una tienda que no se conoce se limpia, y nada o basura es «sin tienda»', () => {
  assert.equal(claveDeTienda('Supermercados Pepe S.L.'), 'pepe');
  assert.equal(claveDeTienda(null), '');
  assert.equal(claveDeTienda(undefined), '');
  assert.equal(claveDeTienda('  '), '');
  assert.equal(claveDeTienda('12'), '');
});

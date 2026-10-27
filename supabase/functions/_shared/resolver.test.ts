import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digitoDeControl } from './gtin.ts';
import {
  CONFIG_DEFECTO,
  decidir,
  fusionar,
  prepararConsulta,
  puntuar,
  resolverLineas,
  type Candidato,
  type Consulta,
  type EntradaLinea,
  type FuenteCandidatos,
  type FuenteSupermercado,
  type ResultadoFuente,
} from './resolver.ts';

// ── Ayudas ────────────────────────────────────────────────────────────────

function ean13(cuerpo12: string): string {
  return cuerpo12 + String(digitoDeControl(cuerpo12));
}

function cand(c: Partial<Candidato> & { nombre: string }): Candidato {
  return {
    fuentes: ['off'],
    origenes: ['off'],
    productoId: null,
    ean: null,
    marca: null,
    tamano: null,
    categorias: [],
    imagen: null,
    tiendas: [],
    ...c,
  };
}

function linea(id: string, texto: string, nombre: string, tiendaClave = 'mercadona'): EntradaLinea {
  return { id, texto, nombre, tiendaClave };
}

type Espia = FuenteCandidatos & { llamadas: Consulta[] };

/** Una fuente de mentira: contesta lo que diga `responde` y apunta cada pregunta. */
function fuente(
  id: string,
  coste: 'local' | 'externa',
  responde: (c: Consulta) => Candidato[] | ResultadoFuente,
): Espia {
  const llamadas: Consulta[] = [];
  return {
    id,
    coste,
    llamadas,
    clave: (c) => c.palabras.join(' ') + '|' + (c.ean ?? '') + '|' + c.clave,
    async buscar(c) {
      llamadas.push(c);
      const r = responde(c);
      return Array.isArray(r) ? { tipo: 'ok', candidatos: r } : r;
    },
  };
}

const LITRO = { familia: 'volume', total: 1000 } as const;

// ── 1 · EAN exacto ────────────────────────────────────────────────────────

test('1 · un EAN válido impreso en la línea que coincide con el candidato se asigna solo, con la marca confirmada', async () => {
  const ean = ean13('841012801009');
  const off = fuente('off', 'externa', (c) =>
    c.ean === ean ? [cand({ nombre: 'Leche entera', marca: 'Pascual', ean, tamano: LITRO, categorias: ['en:milks'] })] : [],
  );
  const [r] = await resolverLineas([linea('a', `LECHE ENT ${ean}`, 'leche entera')], [off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.elegido, true);
  assert.equal(r.candidatos[0].marca, 'Pascual');
  assert.equal(r.estadoMarca, 'confirmada');
  assert.equal(r.confianza, 'alta');
  assert.equal(r.necesitaRevision, false);
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'ean'));
});

test('1 · un número que parece un código pero no tiene el control bueno no es un EAN', () => {
  const malo = '8410128010090'; // el control correcto es otro
  const buenos = prepararConsulta(linea('a', `LECHE ${ean13('841012801009')}`, 'leche'));
  const malos = prepararConsulta(linea('a', `LECHE ${malo === ean13('841012801009') ? '8410128010091' : malo}`, 'leche'));
  assert.notEqual(buenos.ean, null);
  assert.equal(malos.ean, null);
});

test('1 · un EAN impreso que NO es el del candidato no suma nada', () => {
  const consulta = prepararConsulta(linea('a', `LECHE ${ean13('841012801009')}`, 'leche'));
  const otro = puntuar(consulta, cand({ nombre: 'Leche entera', ean: ean13('841012801010') }));
  assert.ok(!otro.senales.some((s) => s.tipo === 'ean'));
  assert.equal(otro.directa, false);
});

// ── 2 · Nombre y formato con OFF ──────────────────────────────────────────

test('2 · nombre, tamaño y marca escrita en la línea: se asigna solo y la marca consta como confirmada por el recibo', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Cola Cao Original', marca: 'Cola Cao', tamano: { familia: 'mass', total: 383 }, categorias: ['en:cocoa-and-chocolate-powders'] }),
    cand({ nombre: 'Cola Cao Turbo', marca: 'Cola Cao', tamano: { familia: 'mass', total: 383 } }),
  ]);
  const [r] = await resolverLineas([linea('a', 'COLA CAO ORIGINAL 383G', 'cola cao original 383 g')], [off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].nombre, 'Cola Cao Original');
  assert.equal(r.estadoMarca, 'confirmada');
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'marca_impresa'));
});

test('2 · nombre y tamaño sin marca escrita: se propone, la marca consta como INFERIDA y se pide revisar', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Galletas María Dorada', marca: 'Artiach', tamano: { familia: 'mass', total: 800 }, categorias: ['en:biscuits'] }),
    cand({ nombre: 'Galletas María Dorada', marca: 'Fontaneda', tamano: { familia: 'mass', total: 400 }, categorias: ['en:biscuits'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'GALLETAS MARIA DORADA 800G', 'galletas maría dorada 800 g')], [off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, 'Artiach');
  assert.equal(r.estadoMarca, 'inferida');
  assert.equal(r.necesitaRevision, true);
  // La del otro tamaño ni siquiera se ofrece.
  assert.equal(r.candidatos.length, 1);
});

// ── 3 · Abreviada con varios candidatos ───────────────────────────────────

test('3 · una línea abreviada que encaja con varios productos NO elige marca: enseña las opciones', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Queso de Burgos desnatado', marca: 'Hacendado', categorias: ['en:cheeses'] }),
    cand({ nombre: 'Queso de Burgos desnatado', marca: 'Carrefour', categorias: ['en:cheeses'] }),
    cand({ nombre: 'Queso Burgos desnatado', marca: 'Central Lechera Asturiana', categorias: ['en:cheeses'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'Q.BURGOS DESNA', 'queso burgos desnatado')], [off]);
  assert.equal(r.estado, 'ambigua');
  assert.equal(r.elegido, false);
  assert.equal(r.estadoMarca, 'desconocida');
  assert.equal(r.necesitaRevision, true);
  assert.equal(r.candidatos.length, 3);
});

// ── 4 · Dos muy parecidos con distinto tamaño ─────────────────────────────

test('4 · 2 L no es 330 ml aunque se llamen igual: con tamaño en la línea gana el que cuadra', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Coca-Cola Zero', marca: 'Coca-Cola', tamano: { familia: 'volume', total: 330 }, categorias: ['en:sodas'] }),
    cand({ nombre: 'Coca-Cola Zero', marca: 'Coca-Cola', tamano: { familia: 'volume', total: 2000 }, categorias: ['en:sodas'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'COCA COLA ZERO 2L', 'coca cola zero 2 l')], [off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].tamano?.total, 2000);
  assert.ok(r.candidatos.every((c) => c.tamano?.total !== 330));
});

test('4 · sin tamaño en la línea, los dos tamaños empatan y se pide elegir aunque la puntuación parezca alta', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Coca-Cola Zero', marca: 'Coca-Cola', tamano: { familia: 'volume', total: 330 }, categorias: ['en:sodas'] }),
    cand({ nombre: 'Coca-Cola Zero', marca: 'Coca-Cola', tamano: { familia: 'volume', total: 2000 }, categorias: ['en:sodas'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'COCA COLA ZERO', 'coca cola zero')], [off]);
  assert.equal(r.estado, 'ambigua');
  assert.equal(r.elegido, false);
  assert.ok(r.puntuacion >= CONFIG_DEFECTO.umbralAuto, 'la puntuación del primero es alta…');
  assert.equal(r.candidatos.length, 2, '…y aun así se enseñan los dos');
});

test('4 · un solo candidato bueno pero con el tamaño contradicho no se asigna solo', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Leche entera', marca: 'Pascual', tamano: { familia: 'volume', total: 200 }, categorias: ['en:milks'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENTERA 1L', 'leche entera 1 l')], [off]);
  assert.equal(r.elegido, false);
  assert.equal(r.estadoMarca, 'desconocida');
});

// ── 5 · No encontrado ─────────────────────────────────────────────────────

test('5 · un producto que ninguna fuente conoce queda sin identificar, sin marca y sin pedir revisión', async () => {
  const [r] = await resolverLineas(
    [linea('a', 'PASTEL DE LA ABUELA', 'pastel de la abuela')],
    [fuente('historial', 'local', () => []), fuente('off', 'externa', () => [])],
  );
  assert.equal(r.estado, 'sin_candidatos');
  assert.equal(r.candidatos.length, 0);
  assert.equal(r.estadoMarca, 'desconocida');
  assert.equal(r.confianza, 'ninguna');
  assert.equal(r.necesitaRevision, false);
});

test('5 · la tienda sola no demuestra nada: un candidato que "se vende en Mercadona" pero no se parece no se ofrece', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Detergente líquido', marca: 'Hacendado', tiendas: ['mercadona'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'HUMMUS CLASICO', 'hummus clásico', 'mercadona')], [off]);
  assert.equal(r.estado, 'sin_candidatos');
  assert.equal(r.candidatos.length, 0);
});

test('5 · la marca nunca se inventa: un producto identificado sin marca en la ficha sigue sin marca', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Galletas María Dorada', marca: null, tamano: { familia: 'mass', total: 800 }, categorias: ['en:biscuits'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'GALLETAS MARIA DORADA 800G', 'galletas maría dorada 800 g')], [off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, null);
  assert.equal(r.estadoMarca, 'desconocida');
  assert.equal(r.necesitaRevision, false);
});

test('5 · solo con el nombre, aunque sea perfecto y único, no basta para asignar una marca', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Leche entera', marca: 'Pascual', tamano: LITRO, categorias: ['en:milks'] }),
  ]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENTERA', 'leche entera')], [off]);
  assert.equal(r.elegido, false, 'sin tamaño ni marca escrita, es evidencia débil');
  assert.equal(r.estadoMarca, 'desconocida');
  assert.equal(r.candidatos[0].marca, 'Pascual', 'pero se ofrece como opción');
});

// ── 6 · Líneas que no son productos ───────────────────────────────────────

test('6 · un subtotal, un descuento y el pago no se resuelven ni consultan ninguna fuente', async () => {
  const off = fuente('off', 'externa', () => [cand({ nombre: 'Algo' })]);
  const rs = await resolverLineas(
    [
      linea('a', 'SUBTOTAL 23,45', 'subtotal'),
      linea('b', 'DTO 2ª UNIDAD -0,45', 'descuento'),
      linea('c', 'TARJETA 23,45', 'tarjeta'),
      linea('d', 'TOTAL 0% NATURAL', 'yogur total 0% natural'),
    ],
    [off],
  );
  assert.deepEqual(rs.map((r) => r.estado).slice(0, 3), ['no_producto', 'no_producto', 'no_producto']);
  assert.deepEqual(rs.slice(0, 3).map((r) => r.motivoNoProducto), ['total', 'descuento', 'pago']);
  assert.notEqual(rs[3].estado, 'no_producto', 'el yogur "Total 0%" sí es un producto');
  assert.equal(off.llamadas.length, 1, 'solo se preguntó por el yogur');
});

// ── 7 · Fallos de las fuentes ─────────────────────────────────────────────

test('7 · si OFF falla, la línea sigue con lo que haya y el fallo queda anotado', async () => {
  const historial = fuente('historial', 'local', () => []);
  const off = fuente('off', 'externa', () => ({ tipo: 'error', motivo: 'tiempo_agotado' }));
  const [r] = await resolverLineas([linea('a', 'ATUN CLARO PACK 6', 'atún claro pack de 6')], [historial, off]);
  assert.equal(r.estado, 'sin_candidatos');
  assert.deepEqual(r.fuentes, [
    { id: 'historial', estado: 'ok' },
    { id: 'off', estado: 'error', motivo: 'tiempo_agotado' },
  ]);
  assert.equal(r.reintentable, false);
});

test('7 · una fuente que lanza una excepción no tumba la importación', async () => {
  const rota: FuenteCandidatos = {
    id: 'off',
    coste: 'externa',
    clave: () => 'x',
    async buscar() {
      throw new Error('boom');
    },
  };
  const catalogo = fuente('catalogo', 'local', () => [
    cand({ fuentes: ['catalogo'], productoId: 'p1', nombre: 'Pan de molde integral', marca: 'Bimbo', tamano: { familia: 'mass', total: 460 }, categorias: ['en:breads'] }),
  ]);
  const rs = await resolverLineas(
    [linea('a', 'PAN MOLDE INTEGRAL 460G', 'pan de molde integral 460 g'), linea('b', 'LECHE', 'leche')],
    [catalogo, rota],
  );
  assert.equal(rs.length, 2);
  assert.equal(rs[0].fuentes.find((f) => f.id === 'off')?.estado, 'omitida', 'la primera ya estaba resuelta con el catálogo');
  assert.equal(rs[1].fuentes.find((f) => f.id === 'off')?.estado, 'error');
});

test('7 · si una fuente se queda sin cupo, las demás líneas no insisten y se marcan para reintentar', async () => {
  const off = fuente('off', 'externa', () => ({ tipo: 'limite', esperaS: 30 }));
  const rs = await resolverLineas(
    [linea('a', 'ARROZ REDONDO 1KG', 'arroz redondo 1 kg'), linea('b', 'LENTEJAS PARDINAS', 'lentejas pardinas'), linea('c', 'HARINA', 'harina')],
    [off],
    { concurrencia: 1 },
  );
  assert.equal(off.llamadas.length, 1);
  assert.deepEqual(rs.map((r) => r.reintentable), [true, true, true]);
  assert.deepEqual(rs.map((r) => r.fuentes[0].estado), ['limite', 'omitida', 'omitida']);
  assert.deepEqual(rs.map((r) => r.fuentes[0].esperaS), [30, 30, 30], 'y todas dicen cuánto esperar');
});

test('7 · las líneas iguales comparten una sola consulta', async () => {
  const off = fuente('off', 'externa', () => []);
  await resolverLineas(
    [linea('a', 'LENTEJAS PARDINAS', 'lentejas pardinas'), linea('b', 'Lentejas Pardinas', 'lentejas pardinas')],
    [off],
    { concurrencia: 1 },
  );
  assert.equal(off.llamadas.length, 1);
});

// ── 8 y 9 · Historial ─────────────────────────────────────────────────────

const ASOCIADO = (tienda: string, extra: Partial<Candidato> = {}) =>
  cand({
    fuentes: ['historial'],
    origenes: ['usuario'],
    productoId: 'p-leche',
    nombre: 'Leche entera',
    marca: 'Pascual',
    tamano: LITRO,
    asociacion: { tiendaClave: tienda, confirmaciones: 2 },
    ...extra,
  });

test('8 · una asociación confirmada para el mismo supermercado se aplica sola y no se gasta el cupo de OFF', async () => {
  const historial = fuente('historial', 'local', () => [ASOCIADO('mercadona')]);
  const off = fuente('off', 'externa', () => []);
  const [r] = await resolverLineas([linea('a', 'LECHE ENT 1L', 'leche entera 1 l', 'mercadona')], [historial, off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, 'Pascual');
  assert.equal(r.estadoMarca, 'confirmada');
  assert.equal(r.necesitaRevision, false);
  assert.equal(off.llamadas.length, 0);
  assert.equal(r.fuentes.find((f) => f.id === 'off')?.estado, 'omitida');
});

test('9 · la misma línea en OTRA tienda es una pista, no una prueba: se ofrece pero no se asigna', async () => {
  const historial = fuente('historial', 'local', () => [ASOCIADO('lidl')]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENT 1L', 'leche entera 1 l', 'mercadona')], [historial]);
  assert.equal(r.elegido, false);
  assert.equal(r.estado, 'ambigua');
  assert.equal(r.candidatos[0].marca, 'Pascual');
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'historial_otra_tienda'));
});

test('9 · la pista de otra tienda no suma para decidir: si el producto se sostiene por sí solo, se decide por lo que demuestra', async () => {
  // El mismo producto lo trae también OFF, con la marca escrita en la línea y el tamaño: eso sí demuestra.
  const historial = fuente('historial', 'local', () => [ASOCIADO('lidl', { categorias: ['en:milks'] })]);
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Leche entera', marca: 'Pascual', tamano: LITRO, categorias: ['en:milks'], productoId: 'p-leche' }),
  ]);
  const [r] = await resolverLineas([linea('a', 'LECHE PASCUAL 1L', 'leche pascual 1 l', 'mercadona')], [historial, off]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, 'Pascual');
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'marca_impresa'));
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'historial_otra_tienda'));
  assert.equal(r.candidatos[0].directa, false, 'y no cuenta como confirmado en esta tienda');
});

test('9 · ni sumando la pista de otra tienda llega a asignarse solo un producto que solo se parece por el nombre', async () => {
  const historial = fuente('historial', 'local', () => [ASOCIADO('lidl', { tamano: null, categorias: ['en:milks'] })]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENTERA', 'leche entera', 'mercadona')], [historial]);
  assert.equal(r.elegido, false);
});

test('9 · una asociación sin tienda tampoco se aplica a una tienda concreta', async () => {
  const historial = fuente('historial', 'local', () => [ASOCIADO('')]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENT 1L', 'leche entera 1 l', 'mercadona')], [historial]);
  assert.equal(r.elegido, false);
});

test('9 · una asociación que choca con el tamaño de la línea no se aplica sola, aunque sea de la misma tienda', async () => {
  const historial = fuente('historial', 'local', () => [
    ASOCIADO('mercadona', { tamano: { familia: 'volume', total: 200 } }),
  ]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENT 1L', 'leche entera 1 l', 'mercadona')], [historial]);
  assert.equal(r.elegido, false);
  assert.equal(r.estado, 'ambigua');
});

test('9 · dos asociaciones directas que apuntan a productos distintos no se deciden solas', async () => {
  const historial = fuente('historial', 'local', () => [
    ASOCIADO('mercadona'),
    ASOCIADO('mercadona', { productoId: 'p-otra', marca: 'Hacendado' }),
  ]);
  const [r] = await resolverLineas([linea('a', 'LECHE ENT 1L', 'leche entera 1 l', 'mercadona')], [historial]);
  assert.equal(r.elegido, false);
});

// ── 10 · Corrección manual de una marca ───────────────────────────────────

test('10 · una marca escrita a mano y confirmada se reutiliza: sin producto de catálogo y con la marca de la persona', async () => {
  const historial = fuente('historial', 'local', () => [
    cand({
      fuentes: ['historial'],
      origenes: ['usuario'],
      nombre: 'Pan de pueblo',
      marca: 'Horno de Lola',
      asociacion: { tiendaClave: 'mercadona', confirmaciones: 1 },
    }),
  ]);
  const [r] = await resolverLineas([linea('a', 'PAN PUEBLO', 'pan de pueblo', 'mercadona')], [historial]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, 'Horno de Lola');
  assert.equal(r.candidatos[0].productoId, null);
  assert.equal(r.estadoMarca, 'confirmada');
});

// ── 11 · Sin duplicar ni contar dos veces ─────────────────────────────────

test('11 · el mismo producto del catálogo y de OFF es UN candidato, y no cuenta como dos opiniones', () => {
  const ean = ean13('841012801009');
  const juntos = fusionar([
    cand({ fuentes: ['catalogo'], origenes: ['off'], productoId: 'p1', ean, nombre: 'Leche entera', marca: 'Pascual' }),
    cand({ fuentes: ['off'], origenes: ['off'], ean, nombre: 'Leche entera', marca: 'Pascual', imagen: 'https://images.openfoodfacts.org/x.jpg' }),
  ]);
  assert.equal(juntos.length, 1);
  assert.deepEqual(juntos[0].fuentes, ['catalogo', 'off']);
  assert.equal(juntos[0].productoId, 'p1');
  assert.equal(juntos[0].imagen, 'https://images.openfoodfacts.org/x.jpg');

  const consulta = prepararConsulta(linea('a', 'LECHE ENTERA 1L', 'leche entera 1 l'));
  const p = puntuar(consulta, juntos[0]);
  assert.ok(!p.senales.some((s) => s.tipo === 'corroborado'), 'catálogo y OFF son el mismo dato');
});

test('11 · un catálogo de supermercado SÍ es un origen distinto: suma una corroboración', () => {
  const ean = ean13('841012801009');
  const juntos = fusionar([
    cand({ fuentes: ['off'], origenes: ['off'], ean, nombre: 'Leche entera', marca: 'Pascual' }),
    cand({ fuentes: ['supermercado:demo'], origenes: ['supermercado'], ean, nombre: 'Leche entera', marca: 'Pascual' }),
  ]);
  assert.equal(juntos.length, 1);
  const p = puntuar(prepararConsulta(linea('a', 'LECHE ENTERA 1L', 'leche entera 1 l')), juntos[0]);
  assert.ok(p.senales.some((s) => s.tipo === 'corroborado'));
});

test('11 · dos candidatos sin identificador con el mismo nombre, marca y tamaño se funden; con otra marca u otro tamaño, no', () => {
  const a = cand({ nombre: 'Atún claro', marca: 'Calvo', tamano: { familia: 'mass', total: 112 } });
  assert.equal(fusionar([a, cand({ nombre: 'ATÚN CLARO', marca: 'calvo', tamano: { familia: 'mass', total: 112 } })]).length, 1);
  assert.equal(fusionar([a, cand({ nombre: 'Atún claro', marca: 'Isabel', tamano: { familia: 'mass', total: 112 } })]).length, 2);
  assert.equal(fusionar([a, cand({ nombre: 'Atún claro', marca: 'Calvo', tamano: { familia: 'mass', total: 336 } })]).length, 2);
});

test('11 · lo que la persona confirmó manda sobre lo que dice una fuente al fusionar', () => {
  const ean = ean13('841012801009');
  const [uno] = fusionar([
    cand({ fuentes: ['off'], ean, nombre: 'Leche entera uht', marca: 'Pascual' }),
    cand({ fuentes: ['historial'], origenes: ['usuario'], ean, nombre: 'Leche entera', marca: 'Pascual S.A.', asociacion: { tiendaClave: 'lidl', confirmaciones: 3 } }),
  ]);
  assert.equal(uno.marca, 'Pascual S.A.');
  assert.equal(uno.asociacion?.confirmaciones, 3);
});

// ── Orden de las fuentes y configuración ──────────────────────────────────

test('si el catálogo local ya decide, no se gasta el cupo de OFF; si no, se pregunta', async () => {
  const catalogo = fuente('catalogo', 'local', (c) =>
    c.palabras.includes('mantequilla')
      ? [cand({ fuentes: ['catalogo'], productoId: 'p2', nombre: 'Mantequilla', marca: 'Président', tamano: { familia: 'mass', total: 250 }, categorias: ['en:butters'] })]
      : [],
  );
  const off = fuente('off', 'externa', () => []);
  const rs = await resolverLineas(
    [linea('a', 'MANTEQUILLA 250G', 'mantequilla 250 g'), linea('b', 'MERMELADA FRESA', 'mermelada de fresa')],
    [catalogo, off],
    { concurrencia: 1 },
  );
  assert.equal(rs[0].estado, 'resuelta');
  assert.equal(rs[1].estado, 'sin_candidatos');
  assert.equal(off.llamadas.length, 1, 'solo para la mermelada');
});

test('los umbrales son configurables: más estrictos, menos asignaciones automáticas', () => {
  const consulta = prepararConsulta(linea('a', 'GALLETAS MARIA DORADA 800G', 'galletas maría dorada 800 g'));
  const c = puntuar(
    consulta,
    cand({ nombre: 'Galletas María Dorada', marca: 'Artiach', tamano: { familia: 'mass', total: 800 }, categorias: ['en:biscuits'] }),
  );
  assert.equal(decidir([c]).elegido, true);
  assert.equal(decidir([c], { ...CONFIG_DEFECTO, umbralAuto: 95 }).elegido, false);
  assert.equal(decidir([c], { ...CONFIG_DEFECTO, margenMinimo: 15, coberturaMinimaAuto: 1.1 }).elegido, false);
});

test('los resultados salen en el orden de las líneas aunque se resuelvan a la vez', async () => {
  const off = fuente('off', 'externa', () => []);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const rs = await resolverLineas(
    ids.map((id, i) => linea(id, `PRODUCTO RARO ${i}`, `producto raro ${'x'.repeat(i + 1)}`)),
    [off],
    { concurrencia: 4 },
  );
  assert.deepEqual(rs.map((r) => r.id), ids);
});

// ── Fuentes de supermercado ───────────────────────────────────────────────

test('una fuente de supermercado se enchufa con la misma interfaz y se pregunta cuando OFF no basta', async () => {
  const ean = ean13('841012801009');
  const demo: FuenteSupermercado = {
    id: 'supermercado:demo',
    coste: 'externa',
    tiendas: ['mercadona'],
    clave: (c) => c.palabras.join(' '),
    async buscar() {
      return {
        tipo: 'ok',
        candidatos: [cand({ fuentes: ['supermercado:demo'], origenes: ['supermercado'], ean, nombre: 'Leche entera', marca: 'Hacendado', tamano: LITRO, categorias: ['en:milks'], tiendas: ['mercadona'] })],
      };
    },
  };
  const off = fuente('off', 'externa', () => []);
  const [r] = await resolverLineas([linea('a', 'LECHE ENTERA HACENDADO 1L', 'leche entera hacendado 1 l')], [off, demo]);
  assert.equal(r.estado, 'resuelta');
  assert.deepEqual(r.candidatos[0].fuentes, ['supermercado:demo']);
  assert.ok(r.candidatos[0].senales.some((s) => s.tipo === 'tienda'), 'la tienda ordena, no demuestra');
  assert.equal(off.llamadas.length, 1);
});

test('si una fuente externa ya decidió, la siguiente externa no gasta cupo aunque pudiera corroborar', async () => {
  const off = fuente('off', 'externa', () => [
    cand({ nombre: 'Leche entera', marca: 'Hacendado', tamano: LITRO, categorias: ['en:milks'] }),
  ]);
  const segunda = fuente('supermercado:demo', 'externa', () => []);
  const [r] = await resolverLineas([linea('a', 'LECHE ENTERA HACENDADO 1L', 'leche entera hacendado 1 l')], [off, segunda]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(segunda.llamadas.length, 0);
});

// ── La puntuación se explica ──────────────────────────────────────────────

test('cada punto de la puntuación tiene una señal con nombre, y la suma cuadra', () => {
  const consulta = prepararConsulta(linea('a', 'GALLETAS MARIA DORADA 800G', 'galletas maría dorada 800 g'));
  const p = puntuar(
    consulta,
    cand({ nombre: 'Galletas María Dorada', marca: 'Artiach', tamano: { familia: 'mass', total: 800 }, categorias: ['en:biscuits'] }),
  );
  assert.equal(p.puntos, p.senales.reduce((s, x) => s + x.puntos, 0));
  assert.deepEqual(
    p.senales.map((s) => s.tipo).sort(),
    ['categoria', 'nombre', 'tamano'],
  );
  assert.ok(p.puntos >= 0 && p.puntos <= 100);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  aplicarResoluciones,
  confirmarSugerida,
  dejarSinIdentificar,
  elegirCandidato,
  escribirMarca,
  esperaDe,
  indicador,
  leerResolucion,
  marcaMostrada,
  marcarBuscando,
  marcarFallidas,
  opcionesDisponibles,
  origenDe,
  paraAprender,
  razonesDe,
  siguienteTanda,
  TAMANO_TANDA,
  textoTamano,
  vinculoDe,
  volverABuscar,
  type CandidatoMarca,
  type ResolucionLinea,
} from './marcas.ts';
import { leerProductosTicket, lineasIniciales, pendientesDeGuardar, type LineaRevision } from './lineas.ts';

const UUID = '11111111-1111-4111-8111-111111111111';

function candidato(extra: Partial<CandidatoMarca> = {}): CandidatoMarca {
  return {
    fuente: 'off',
    fuentes: ['off'],
    productoId: null,
    ean: '8410128010096',
    nombre: 'Leche entera',
    marca: 'Pascual',
    tamano: { familia: 'volume', total: 1000 },
    puntos: 72,
    senales: [{ tipo: 'nombre', puntos: 50 }, { tipo: 'tamano', puntos: 15 }],
    incompatible: false,
    directa: false,
    ...extra,
  };
}

function resolucion(id: string, extra: Partial<ResolucionLinea> = {}): ResolucionLinea {
  return {
    id,
    estado: 'resuelta',
    motivoNoProducto: null,
    clave: 'leche ent',
    tiendaClave: 'mercadona',
    elegido: true,
    puntuacion: 72,
    confianza: 'alta',
    estadoMarca: 'inferida',
    necesitaRevision: true,
    reintentable: false,
    fuentes: [{ id: 'off', estado: 'ok' }],
    candidatos: [candidato()],
    ...extra,
  };
}

function filas(): LineaRevision[] {
  return lineasIniciales([
    { nombre: 'leche entera', cantidad: 1, unidad: 'l', comida: true, texto: 'LECHE ENT', precio: 0.89 },
    { nombre: 'bolsa de plástico', cantidad: 3, unidad: 'unidades', comida: false },
    { nombre: 'pan', cantidad: null, unidad: null, comida: true },
  ]);
}

// ── Compatibilidad con tickets leídos como antes ──────────────────────────

test('un ticket leído sin texto ni precio (como antes) sigue abriéndose y no inventa nada', () => {
  const productos = leerProductosTicket([{ nombre: 'leche', cantidad: 1, unidad: 'l', comida: true }]);
  assert.ok(!('texto' in productos[0]!) && !('precio' in productos[0]!));
  const [fila] = lineasIniciales(productos);
  assert.equal(fila!.texto, undefined);
  assert.equal(fila!.precio, undefined);
  assert.equal(fila!.busqueda, 'pendiente');
  assert.equal(fila!.eleccion, undefined);
});

test('el texto impreso y el precio se leen, limpios, cuando llegan', () => {
  const rlo = String.fromCharCode(0x202e);
  const [p] = leerProductosTicket([
    { nombre: 'pan', texto: `PAN${rlo}  INTEGRAL${'X'.repeat(300)}`, precio: 1.2345, comida: true },
  ]);
  assert.ok(p!.texto && !p!.texto.includes(rlo) && [...p!.texto].length <= 120);
  assert.equal(p!.precio, 1.23);
  assert.equal(leerProductosTicket([{ nombre: 'a', precio: -3 }])[0]!.precio, undefined);
  assert.equal(leerProductosTicket([{ nombre: 'a', precio: 'gratis' }])[0]!.precio, undefined);
  assert.equal(leerProductosTicket([{ nombre: 'a', texto: 5 }])[0]!.texto, undefined);
});

test('lo que no parece comida no se busca; lo demás queda pendiente', () => {
  assert.deepEqual(filas().map((l) => l.busqueda), ['pendiente', 'no_aplica', 'pendiente']);
});

// ── Leer la respuesta ─────────────────────────────────────────────────────

test('leerResolucion se queda con lo esperado y tira lo raro', () => {
  const r = leerResolucion({
    tienda: { clave: 'mercadona' },
    lineas: [
      {
        id: 'l0',
        estado: 'ambigua',
        clave: 'leche ent',
        tiendaClave: 'mercadona',
        elegido: false,
        puntuacion: 55,
        confianza: 'media',
        estadoMarca: 'desconocida',
        necesitaRevision: true,
        reintentable: false,
        fuentes: [{ id: 'off', estado: 'ok' }, 'basura'],
        candidatos: [
          { nombre: 'Leche entera', marca: 'Pascual', puntos: 55, productoId: UUID, ean: '8410128010096', fuente: 'off', fuentes: ['off'], senales: [{ tipo: 'tamano', puntos: 15 }, { tipo: 5 }], tamano: { familia: 'volume', total: 1000 } },
          { nombre: '', puntos: 50 }, // sin nombre
          { nombre: 'Sin puntos' },
          'basura',
        ],
      },
      { id: 'con espacio', estado: 'ambigua' },
      { id: 'l1', estado: 'inventado' },
      null,
    ],
  });
  assert.equal(r.tiendaClave, 'mercadona');
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0]!.candidatos.length, 1);
  assert.equal(r.lineas[0]!.candidatos[0]!.marca, 'Pascual');
  assert.equal(r.lineas[0]!.candidatos[0]!.productoId, UUID);
  assert.deepEqual(r.lineas[0]!.candidatos[0]!.senales, [{ tipo: 'tamano', puntos: 15 }]);
  assert.deepEqual(r.lineas[0]!.fuentes, [{ id: 'off', estado: 'ok' }]);
});

test('leerResolucion no se fía de un id raro, un EAN con letras ni una marca con caracteres ocultos', () => {
  const rlo = String.fromCharCode(0x202e);
  const r = leerResolucion({
    lineas: [{ id: 'l0', estado: 'resuelta', elegido: true, candidatos: [{ nombre: `Pan${rlo}`, marca: `Bimbo${rlo}\n`.repeat(40), puntos: 70, productoId: 'no-es-uuid', ean: '84101280100AB' }] }],
  });
  const c = r.lineas[0]!.candidatos[0]!;
  assert.equal(c.productoId, null);
  assert.equal(c.ean, null);
  assert.ok(!c.nombre.includes(rlo) && !(c.marca ?? '').includes(rlo));
  assert.ok([...(c.marca ?? '')].length <= 80);
});

test('"elegido" sin candidatos no asigna nada', () => {
  const r = leerResolucion({ lineas: [{ id: 'l0', estado: 'resuelta', elegido: true, candidatos: [] }] });
  assert.equal(r.lineas[0]!.elegido, false);
  const ambigua = leerResolucion({ lineas: [{ id: 'l0', estado: 'ambigua', elegido: true, candidatos: [{ nombre: 'x', puntos: 50 }] }] });
  assert.equal(ambigua.lineas[0]!.elegido, false, 'una línea ambigua no viene asignada por mucho que lo diga');
});

test('cualquier cosa que no sea la respuesta esperada da una lista vacía', () => {
  for (const v of [null, 'x', 3, [], {}, { lineas: 'no' }, { lineas: null }]) {
    assert.deepEqual(leerResolucion(v), { tiendaClave: '', lineas: [] });
  }
  const muchas = leerResolucion({ lineas: Array.from({ length: 200 }, (_, i) => ({ id: `l${i}`, estado: 'sin_candidatos' })) });
  assert.equal(muchas.lineas.length, 60);
});

// ── Por tandas ────────────────────────────────────────────────────────────

test('la siguiente tanda son las pendientes con nombre, con el texto impreso si lo hay', () => {
  assert.deepEqual(siguienteTanda(filas()), [
    { id: 'l0', texto: 'LECHE ENT', nombre: 'leche entera' },
    { id: 'l2', texto: 'pan', nombre: 'pan' },
  ]);
});

test('la tanda tiene tope y se salta lo guardado, lo vacío y el tabaco', () => {
  const muchas = lineasIniciales(Array.from({ length: 20 }, (_, i) => ({ nombre: `producto ${i}`, cantidad: null, unidad: null, comida: true })));
  assert.equal(siguienteTanda(muchas).length, TAMANO_TANDA);
  const raras = muchas.slice(0, 4).map((l, i) => ({
    ...l,
    nombre: ['', '   ', 'tabaco de liar', 'queso'][i]!,
    guardada: i === 3,
  }));
  assert.deepEqual(siguienteTanda(raras), []);
});

test('buscando y fallida cambian solo las filas pedidas; una fallida se puede volver a pedir', () => {
  const a = marcarBuscando(filas(), ['l0']);
  assert.deepEqual(a.map((l) => l.busqueda), ['buscando', 'no_aplica', 'pendiente']);
  assert.deepEqual(siguienteTanda(a).map((l) => l.id), ['l2'], 'una que ya se está buscando no se pide dos veces');
  const f = marcarFallidas(a, ['l0']);
  assert.equal(f[0]!.busqueda, 'fallida');
  assert.equal(volverABuscar(f, 'l0')[0]!.busqueda, 'pendiente');
});

// ── Aplicar lo que responde el servidor ───────────────────────────────────

test('una resolución firme se asigna sola, con el nombre del catálogo si la persona no tocó el suyo', () => {
  const r = aplicarResoluciones(filas(), [resolucion('l0', { candidatos: [candidato({ nombre: 'Leche entera UHT' })] })]);
  assert.equal(r[0]!.eleccion?.tipo, 'candidato');
  assert.equal(r[0]!.eleccion?.tipo === 'candidato' && r[0]!.eleccion.origen, 'auto');
  assert.equal(r[0]!.nombre, 'Leche entera UHT');
  assert.equal(r[0]!.busqueda, 'hecha');
  assert.equal(r[0]!.confirmada, undefined, 'asignada sola no es confirmada');
});

test('si la persona ya había cambiado el nombre, se respeta', () => {
  const editada = filas().map((l) => (l.clave === 'l0' ? { ...l, nombre: 'mi leche de siempre' } : l));
  const r = aplicarResoluciones(editada, [resolucion('l0')]);
  assert.equal(r[0]!.nombre, 'mi leche de siempre');
  assert.equal(r[0]!.eleccion?.tipo, 'candidato');
});

test('una respuesta que llega tarde NO pisa lo que la persona ya decidió', () => {
  let l = escribirMarca(filas(), 'l0', 'Mi marca');
  l = aplicarResoluciones(l, [resolucion('l0')]);
  assert.deepEqual(l[0]!.eleccion, { tipo: 'manual', marca: 'Mi marca' });
  assert.equal(l[0]!.resolucion?.id, 'l0', 'pero la resolución se guarda por si quiere ver las opciones');

  let s = dejarSinIdentificar(filas(), 'l0');
  s = aplicarResoluciones(s, [resolucion('l0')]);
  assert.deepEqual(s[0]!.eleccion, { tipo: 'ninguna' });
});

test('una resolución ambigua NO asigna ninguna marca y deja las opciones a la vista', () => {
  const r = aplicarResoluciones(filas(), [
    resolucion('l0', { estado: 'ambigua', elegido: false, estadoMarca: 'desconocida', confianza: 'media', candidatos: [candidato(), candidato({ marca: 'Hacendado' })] }),
  ]);
  assert.equal(r[0]!.eleccion, undefined);
  assert.equal(marcaMostrada(r[0]!), null, 'sin elección, la marca es «sin identificar»');
  assert.equal(opcionesDisponibles(r[0]!), 2);
  assert.deepEqual(indicador(r[0]!), { nivel: 'dudosa', texto: 'Dudosa · elige una opción' });
});

test('sin candidatos: marca sin identificar, sin elegir nada y sin pedir revisión', () => {
  const r = aplicarResoluciones(filas(), [resolucion('l2', { estado: 'sin_candidatos', elegido: false, candidatos: [], estadoMarca: 'desconocida', necesitaRevision: false, confianza: 'ninguna' })]);
  assert.equal(r[2]!.eleccion, undefined);
  assert.equal(r[2]!.busqueda, 'hecha');
  assert.deepEqual(indicador(r[2]!), { nivel: 'ninguna', texto: 'Marca sin identificar' });
});

test('lo que no es un producto (descuento, total…) se desmarca, salvo que la persona ya hubiera decidido', () => {
  const r = aplicarResoluciones(filas(), [resolucion('l0', { estado: 'no_producto', motivoNoProducto: 'descuento', elegido: false, candidatos: [] })]);
  assert.equal(r[0]!.incluir, false);
  assert.equal(r[0]!.avisoNoProducto, 'descuento');
  const decidida = aplicarResoluciones(escribirMarca(filas(), 'l0', 'X'), [resolucion('l0', { estado: 'no_producto', motivoNoProducto: 'total', elegido: false, candidatos: [] })]);
  assert.equal(decidida[0]!.incluir, true);
});

test('lo que se quedó sin consultar por el cupo sigue pendiente para la siguiente ronda', () => {
  const r = aplicarResoluciones(filas(), [resolucion('l0', { estado: 'sin_candidatos', elegido: false, candidatos: [], reintentable: true })]);
  assert.equal(r[0]!.busqueda, 'pendiente');
  assert.deepEqual(siguienteTanda(r).map((l) => l.id), ['l0', 'l2']);
});

test('cuánto esperar sale de lo que dijeron las fuentes, y sin dato no se inventa', () => {
  const con = resolucion('l0', { reintentable: true, fuentes: [{ id: 'off', estado: 'limite', esperaS: 42 }] });
  const mas = resolucion('l1', { reintentable: true, fuentes: [{ id: 'off', estado: 'omitida', motivo: 'sin_cupo', esperaS: 3000 }] });
  assert.equal(esperaDe([con, mas]), 3000);
  assert.equal(esperaDe([resolucion('l2')]), null);
  const leida = leerResolucion({ lineas: [{ id: 'l0', estado: 'sin_candidatos', fuentes: [{ id: 'off', estado: 'limite', esperaS: 30 }, { id: 'x', estado: 'limite', esperaS: -5 }, { id: 'y', estado: 'limite', esperaS: 'mucho' }] }] });
  assert.deepEqual(leida.lineas[0]!.fuentes.map((f) => f.esperaS), [30, undefined, undefined]);
});

test('una respuesta para una fila que ya no existe se ignora', () => {
  const antes = filas();
  assert.deepEqual(aplicarResoluciones(antes, [resolucion('zz')]), antes);
});

// ── Lo que hace la persona ────────────────────────────────────────────────

test('elegir un candidato lo deja elegido, confirmado y con su nombre', () => {
  const otra = candidato({ nombre: 'Leche entera', marca: 'Hacendado', ean: '8480000000009' });
  const r = elegirCandidato(aplicarResoluciones(filas(), [resolucion('l0')]), 'l0', otra);
  assert.equal(marcaMostrada(r[0]!), 'Hacendado');
  assert.equal(r[0]!.confirmada, true);
  assert.deepEqual(indicador(r[0]!), { nivel: 'fiable', texto: 'Confirmada por ti' });
});

test('confirmar la sugerida la deja confirmada sin cambiar la elección', () => {
  const sugerida = aplicarResoluciones(filas(), [resolucion('l0')]);
  assert.deepEqual(indicador(sugerida[0]!), { nivel: 'sugerida', texto: 'Sugerida · confírmala' });
  const r = confirmarSugerida(sugerida, 'l0');
  assert.equal(r[0]!.confirmada, true);
  assert.equal(marcaMostrada(r[0]!), 'Pascual');
  assert.equal(confirmarSugerida(filas(), 'l0')[0]!.confirmada, undefined, 'sin sugerida no hay nada que confirmar');
});

test('«sin identificar» es válido, quita la sugerencia y no se recuerda', () => {
  const r = dejarSinIdentificar(aplicarResoluciones(filas(), [resolucion('l0')]), 'l0');
  assert.deepEqual(r[0]!.eleccion, { tipo: 'ninguna' });
  assert.equal(marcaMostrada(r[0]!), null);
  assert.equal(r[0]!.confirmada, false);
  assert.deepEqual(vinculoDe(r[0]!), { tipo: 'ninguno' });
});

test('escribir una marca la fija y desvincula del candidato; en blanco es «sin identificar»', () => {
  const sugerida = aplicarResoluciones(filas(), [resolucion('l0')]);
  const r = escribirMarca(sugerida, 'l0', '  Horno de Lola ');
  assert.deepEqual(r[0]!.eleccion, { tipo: 'manual', marca: 'Horno de Lola' });
  assert.deepEqual(vinculoDe(r[0]!), { tipo: 'marca', marca: 'Horno de Lola' });
  assert.deepEqual(escribirMarca(sugerida, 'l0', '   ')[0]!.eleccion, { tipo: 'ninguna' });
});

test('volver a buscar descarta la sugerencia automática pero no lo que decidió la persona', () => {
  const auto = aplicarResoluciones(filas(), [resolucion('l0')]);
  assert.equal(volverABuscar(auto, 'l0')[0]!.eleccion, undefined);
  const persona = elegirCandidato(auto, 'l0', candidato());
  assert.equal(volverABuscar(persona, 'l0')[0]!.eleccion?.tipo, 'candidato');
});

// ── Con qué producto se enlaza ────────────────────────────────────────────

test('el producto del catálogo manda; si no está, el código; sin nada, ninguno', () => {
  const l = aplicarResoluciones(filas(), [resolucion('l0')]);
  assert.deepEqual(vinculoDe(l[0]!), { tipo: 'codigo', ean: '8410128010096' });
  const conProducto = elegirCandidato(l, 'l0', candidato({ productoId: UUID }));
  assert.deepEqual(vinculoDe(conProducto[0]!), { tipo: 'producto', productoId: UUID, ean: '8410128010096' });
  const sinNada = elegirCandidato(l, 'l0', candidato({ ean: null }));
  assert.deepEqual(vinculoDe(sinNada[0]!), { tipo: 'ninguno' });
  assert.deepEqual(vinculoDe(filas()[0]!), { tipo: 'ninguno' });
});

// ── Qué se recuerda ───────────────────────────────────────────────────────

function guardadas(lineas: LineaRevision[]): LineaRevision[] {
  return lineas.map((l) => ({ ...l, guardada: true }));
}

test('una sugerencia automática sin confirmar NO se convierte en una verdad aprendida', () => {
  const auto = guardadas(aplicarResoluciones(filas(), [resolucion('l0')]));
  assert.deepEqual(paraAprender(auto, 'mercadona'), []);
});

test('lo que la persona confirmó, eligió o escribió se recuerda con su traza, y solo si se guardó', () => {
  const sugerida = aplicarResoluciones(filas(), [resolucion('l0', { clave: 'leche ent' }), resolucion('l2', { clave: 'pan', estado: 'sin_candidatos', elegido: false, candidatos: [] })]);
  const hecho = escribirMarca(confirmarSugerida(sugerida, 'l0'), 'l2', 'Horno de Lola');

  assert.deepEqual(paraAprender(hecho, 'mercadona'), [], 'sin guardar no se aprende');

  const a = paraAprender(guardadas(hecho), 'mercadona', new Map([['l0', UUID]]));
  assert.equal(a.length, 2);
  assert.deepEqual(a[0], {
    clave: 'l0', lineKey: 'leche ent', storeKey: 'mercadona', name: 'Leche entera', brand: 'Pascual',
    productId: UUID, barcode: '8410128010096', unitFamily: 'volume', netQuantity: 1000, source: 'off', matchScore: 72,
  });
  assert.deepEqual(a[1], {
    clave: 'l2', lineKey: 'pan', storeKey: 'mercadona', name: 'pan', brand: 'Horno de Lola',
    productId: null, barcode: null, unitFamily: null, netQuantity: null, source: 'manual', matchScore: null,
  });
});

test('la tienda que se recuerda es la que queda, también «sin tienda»', () => {
  const l = guardadas(escribirMarca(aplicarResoluciones(filas(), [resolucion('l2', { clave: 'pan' })]), 'l2', 'X'));
  assert.equal(paraAprender(l, '')[0]!.storeKey, '');
});

test('sin clave de línea del servidor no se recuerda nada en lugar de inventarla', () => {
  const l = guardadas(escribirMarca(filas(), 'l2', 'X'));
  assert.deepEqual(paraAprender(l, 'mercadona'), [], 'la fila nunca se resolvió');
});

test('«sin identificar» explícito no se recuerda', () => {
  const l = guardadas(dejarSinIdentificar(aplicarResoluciones(filas(), [resolucion('l0')]), 'l0'));
  assert.deepEqual(paraAprender(l, 'mercadona'), []);
});

test('el origen de la asociación sale de la fuente que la propuso', () => {
  assert.equal(origenDe('historial'), 'history');
  assert.equal(origenDe('catalogo'), 'catalog');
  assert.equal(origenDe('off'), 'off');
  assert.equal(origenDe('supermercado:demo'), 'supermarket');
  assert.equal(origenDe('desconocida'), 'off');
});

test('al guardar, cada fila lleva la suya para decidir con qué producto se enlaza', () => {
  const l = aplicarResoluciones(filas(), [resolucion('l0')]);
  const [primera] = pendientesDeGuardar(l);
  assert.equal(primera!.clave, 'l0');
  assert.equal(primera!.fila.eleccion?.tipo, 'candidato');
});

// ── Lo que se enseña ──────────────────────────────────────────────────────

test('las razones se dicen en palabras y el parecido del nombre no se repite', () => {
  assert.deepEqual(razonesDe(candidato()), ['mismo tamaño']);
  assert.deepEqual(
    razonesDe({ senales: [{ tipo: 'ean', puntos: 60 }, { tipo: 'historial', puntos: 70 }, { tipo: 'tamano_distinto', puntos: -40 }, { tipo: 'raro', puntos: 1 }] }),
    ['el código de barras coincide', 'lo confirmaste antes', 'otro tamaño'],
  );
});

test('los tamaños se escriben como se leen', () => {
  assert.equal(textoTamano({ familia: 'volume', total: 1000 }), '1 l');
  assert.equal(textoTamano({ familia: 'volume', total: 330 }), '330 ml');
  assert.equal(textoTamano({ familia: 'mass', total: 1500 }), '1,5 kg');
  assert.equal(textoTamano({ familia: 'mass', total: 250 }), '250 g');
  assert.equal(textoTamano({ familia: 'count', total: 6 }), '6 uds');
  assert.equal(textoTamano(null), null);
});

test('el indicador cuenta en qué punto está la búsqueda', () => {
  const [pendiente] = filas();
  assert.equal(indicador(pendiente!).nivel, 'buscando');
  assert.equal(indicador(marcarBuscando(filas(), ['l0'])[0]!).nivel, 'buscando');
  assert.deepEqual(indicador(marcarFallidas(filas(), ['l0'])[0]!), { nivel: 'ninguna', texto: 'No he podido buscar la marca' });
});

test('una coincidencia fiable (la marca está en el ticket) se enseña como fiable sin que la persona haga nada', () => {
  const r = aplicarResoluciones(filas(), [resolucion('l0', { estadoMarca: 'confirmada', necesitaRevision: false })]);
  assert.deepEqual(indicador(r[0]!), { nivel: 'fiable', texto: 'Coincidencia fiable' });
  assert.equal(r[0]!.confirmada, undefined, 'y aun así no cuenta como una decisión suya');
});

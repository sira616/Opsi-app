import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Camera, Check, Lock, Plus, Receipt, Storefront, X } from 'phosphor-react-native';

import { fetchPendientes, marcarComprada } from '@/api/lista';
import { enlazarProducto, esErrorDeProducto, guardarAsociacion } from '@/api/marcas';
import { fetchSettings } from '@/api/settings';
import { leerTicket, mensajeDeTicket } from '@/api/ticket';
import { ejecutarPropuesta } from '@/features/chat/ejecutar';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { BloqueMarca } from '@/features/ticket/BloqueMarca';
import { HojaMarca } from '@/features/ticket/HojaMarca';
import {
  confirmarSugerida,
  dejarSinIdentificar,
  elegirCandidato,
  escribirMarca,
  paraAprender,
  vinculoDe,
} from '@/features/ticket/marcas';
import { useResolucionMarcas } from '@/features/ticket/useResolucionMarcas';
import {
  bloqueadaPorNombre,
  coincidencias,
  lineasIniciales,
  paraGuardar,
  pendientesDeGuardar,
  siguienteUnidad,
  type LineaRevision,
} from '@/features/ticket/lineas';
import { describeDbError } from '@/shared/lib/db-errors';
import { margenSuperior } from '@/shared/lib/margen';
import { queryKeys } from '@/shared/lib/query';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

type Fase = 'aviso' | 'camara' | 'leyendo' | 'revisar' | 'hecho';

/** Cómo se dice cada unidad en la fila: se toca para cambiarla. */
const ETIQUETA_UNIDAD = { unidades: 'ud.', g: 'g', kg: 'kg', ml: 'ml', l: 'l' } as const;

/**
 * Leer un ticket: de la foto de un ticket de supermercado a lo que has comprado, para guardarlo.
 *
 * Cuatro pasos y ninguno se salta:
 *   1. **Aviso.** La foto sale del móvil hacia un servicio de IA para leerla (y no se guarda en ningún
 *      sitio). Un ticket puede llevar datos que no se quieren compartir —tarjeta, número de cliente—,
 *      y se dice ANTES de hacer la foto.
 *   2. **Cámara** y **lectura.**
 *   3. **Revisión.** Lo leído se enseña línea a línea, editable: se cambia el nombre y la cantidad, se
 *      quita lo que sobra, se añade lo que falte. Lo que no parece comida sale sin marcar. NADA se guarda
 *      hasta pulsar el botón: el modelo propone, la persona confirma.
 *   4. **Guardar.** Fila a fila, con las mismas funciones que el resto de la app (`ejecutarPropuesta`),
 *      de modo que si algo falla a medias lo ya guardado no se repite al reintentar. Opcionalmente tacha
 *      de tus listas lo que ya has comprado, enseñando antes cuáles.
 *
 * Es de Opsi Premium ⭐ (lo comprueba el servidor; aquí el candado solo evita enseñar una cámara que
 * no va a servir). En el navegador no hay cámara.
 */
export default function Ticket() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const margenArriba = margenSuperior(insets.top, Platform.OS, StatusBar.currentHeight);
  const { activa } = useNeveraActual();
  const [permiso, pedirPermiso] = useCameraPermissions();

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

  const camara = useRef<CameraView>(null);
  const [fase, setFase] = useState<Fase>('aviso');
  const [lineas, setLineas] = useState<LineaRevision[]>([]);
  // Las filas de ahora mismo, SIN esperar a un render: las lee el buscador de marcas, que trabaja en segundo
  // plano, y todo lo que las cambia pasa por `cambiarLineas` para que no haya dos versiones.
  const lineasRef = useRef<LineaRevision[]>([]);
  const cambiarLineas = useCallback((f: (actuales: LineaRevision[]) => LineaRevision[]) => {
    lineasRef.current = f(lineasRef.current);
    setLineas(lineasRef.current);
  }, []);
  const [filaDeMarca, setFilaDeMarca] = useState<string | null>(null);
  const marcas = useResolucionMarcas({ neveraId: activa.id, leer: () => lineasRef.current, cambiar: cambiarLineas });
  const [error, setError] = useState<string | null>(null);
  const [tachar, setTachar] = useState(true);
  const [resumen, setResumen] = useState<string | null>(null);
  const contador = useRef(0);

  // Lo pendiente de las listas, solo cuando ya hay algo que revisar (no antes de la foto).
  const pendientes = useQuery({
    queryKey: [...queryKeys.lista, 'pendientes'],
    queryFn: fetchPendientes,
    enabled: premium && fase === 'revisar',
  });

  const aGuardar = paraGuardar(lineas);
  // Barato (unas decenas de líneas contra unas cuantas pendientes): se calcula en cada render y ya.
  const aTachar = coincidencias(aGuardar.map((l) => l.nombre), pendientes.data ?? []);

  const leer = useMutation({
    mutationFn: (imagen: string) => leerTicket(imagen),
    onSuccess(ticket) {
      setError(null);
      cambiarLineas(() => lineasIniciales(ticket.productos));
      marcas.fijarTienda(ticket.tienda);
      setFase(ticket.productos.length === 0 ? 'aviso' : 'revisar');
      if (ticket.productos.length === 0) {
        setError('No he encontrado ningún producto en esa foto. Prueba con el ticket entero y buena luz.');
      } else {
        // La revisión ya está a la vista; las marcas llegan después, por tandas, sin bloquear nada.
        void marcas.iniciar();
      }
    },
    onError(caught) {
      setError(mensajeDeTicket(caught));
      setFase('aviso');
    },
  });

  async function hacerFoto() {
    if (!camara.current) return;
    setFase('leyendo');
    try {
      // Calidad media: un ticket se lee igual y la foto pesa la mitad. No se guarda en el móvil.
      const foto = await camara.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: false });
      if (!foto?.base64) throw new Error('sin foto');
      leer.mutate(foto.base64);
    } catch {
      setError('No he podido hacer la foto. Prueba otra vez.');
      setFase('aviso');
    }
  }

  async function empezar() {
    setError(null);
    if (!permiso?.granted) {
      const r = await pedirPermiso();
      if (!r.granted) {
        setError('Necesito la cámara para leer el ticket. Puedes darle permiso en los ajustes del móvil.');
        return;
      }
    }
    setFase('camara');
  }

  const guardar = useMutation({
    mutationFn: async () => {
      let guardadas = 0;
      let recordadas = 0;
      try {
        for (const { clave, linea, fila } of pendientesDeGuardar(lineasRef.current)) {
          // Con qué producto del catálogo se enlaza lo elegido (sin duplicar ninguno). Si no se puede, se guarda
          // igual, sin enlace: guardar el ticket nunca depende de esto.
          let productoId = await enlazarProducto(vinculoDe(fila), activa.id, linea.nombre);
          try {
            await ejecutarPropuesta({ tipo: 'guardar', productos: [{ ...linea, productoId }] }, { nevera: activa, queryClient, invalidar: false });
          } catch (e) {
            // «Ese producto no es de esta nevera»: se guarda sin enlace en lugar de perder la línea.
            if (productoId === null || !esErrorDeProducto(e)) throw e;
            productoId = null;
            await ejecutarPropuesta({ tipo: 'guardar', productos: [linea] }, { nevera: activa, queryClient, invalidar: false });
          }
          // Cada una que entra se marca: si falla la siguiente, al reintentar no se repite.
          guardadas += 1;
          cambiarLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, guardada: true } : l)));
          // Se recuerda SOLO lo que la persona confirmó, eligió o escribió a propósito, y nunca hace fallar el guardado.
          for (const a of paraAprender([{ ...fila, guardada: true }], marcas.tiendaClave, new Map([[clave, productoId]]))) {
            try {
              await guardarAsociacion(a);
              recordadas += 1;
            } catch {
              // No se pudo recordar: el producto ya está guardado, y eso es lo que importa.
            }
          }
        }
        let tachadas = 0;
        if (tachar) {
          for (const p of aTachar) {
            await marcarComprada(p.id, true);
            tachadas += 1;
          }
        }
        return { guardadas, tachadas, recordadas };
      } finally {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(activa.id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.lista }),
          queryClient.invalidateQueries({ queryKey: queryKeys.premium }),
        ]);
      }
    },
    onSuccess({ guardadas, tachadas, recordadas }) {
      setError(null);
      setResumen(
        `Guardado en ${activa.name}: ${guardadas} ${guardadas === 1 ? 'producto' : 'productos'}.` +
          (tachadas > 0 ? ` Tachado de tus listas: ${tachadas}.` : '') +
          (recordadas > 0 ? ` Marcas recordadas para la próxima vez: ${recordadas}.` : ''),
      );
      setFase('hecho');
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const cambiar = (clave: string, cambios: Partial<LineaRevision>) =>
    cambiarLineas((actuales) => actuales.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  function otraLinea() {
    contador.current += 1;
    cambiarLineas((actuales) => [
      ...actuales,
      // Una línea añadida a mano no se busca sola: tiene un botón para hacerlo cuando ya tenga nombre.
      { clave: `n${contador.current}`, nombre: '', cantidad: '', unidad: 'unidades', incluir: true, comida: true, busqueda: 'no_aplica' },
    ]);
  }

  /** Cierra la hoja de marca y hace lo que se haya elegido en ella. */
  function enFila(accion: (actuales: LineaRevision[], clave: string) => LineaRevision[]) {
    const clave = filaDeMarca;
    setFilaDeMarca(null);
    if (clave !== null) cambiarLineas((actuales) => accion(actuales, clave));
  }

  const filaAbierta = lineas.find((l) => l.clave === filaDeMarca) ?? null;
  const buscandoMarcas = lineas.filter((l) => l.busqueda === 'buscando' || l.busqueda === 'pendiente').length;

  const cerrar = () => (router.canGoBack() ? router.back() : router.replace('/inventario'));

  const barra = (
    <View style={[styles.barra, { paddingTop: margenArriba + space.md }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={cerrar} hitSlop={8} style={styles.redondo}>
        <X size={22} color={c.ink} weight="bold" />
      </Pressable>
      <Text style={t.heading} accessibilityRole="header">
        Leer un ticket
      </Text>
      <View style={styles.redondo} />
    </View>
  );

  // ── Antes de nada: el plan y la cámara ────────────────────────────────

  if (settings.isPending) {
    return (
      <View style={styles.raiz}>
        {barra}
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  if (settings.data?.plan === 'basic') {
    return (
      <View style={styles.raiz}>
        {barra}
        <View style={styles.panel}>
          <Lock size={22} color={c.inkMuted} weight="duotone" />
          <Text style={styles.texto}>
            Leer un ticket es de Opsi Premium ⭐. Le haces una foto y Opsi apunta lo que has comprado para que lo revises.
          </Text>
          <Button label="Ver Opsi Premium ⭐" onPress={() => router.navigate('/premium')} />
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.raiz}>
        {barra}
        <View style={styles.panel}>
          <Text style={styles.texto}>La cámara solo está en el móvil. Abre Opsi en tu móvil para leer un ticket.</Text>
        </View>
      </View>
    );
  }

  // ── La cámara, a pantalla entera ──────────────────────────────────────

  if (fase === 'camara') {
    return (
      <View style={styles.camaraRaiz}>
        <CameraView ref={camara} style={styles.camara} facing="back" accessibilityLabel="Cámara para hacer la foto del ticket" />
        <View style={[styles.camaraBarra, { paddingTop: margenArriba + space.md }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => setFase('aviso')} hitSlop={8} style={styles.redondoOscuro}>
            <X size={22} color="#FFFFFF" weight="bold" />
          </Pressable>
          <Text style={styles.camaraTitulo}>El ticket entero, con buena luz</Text>
          <View style={styles.redondoOscuro} />
        </View>
        <SafeAreaView edges={['bottom']} style={styles.camaraPie}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hacer la foto"
            onPress={() => void hacerFoto()}
            style={({ pressed }) => [styles.disparador, pressed && { opacity: 0.8 }]}
          >
            <Camera size={30} color={c.ground} weight="fill" />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  // ── El resto de pasos ─────────────────────────────────────────────────

  return (
    <View style={styles.raiz}>
      {barra}

      {fase === 'aviso' ? (
        <ScrollView contentContainerStyle={styles.cuerpo}>
          <View style={styles.icono}>
            <Receipt size={32} color={c.brand} weight="duotone" />
          </View>
          <Text style={t.title}>Haz una foto a tu ticket</Text>
          <Text style={styles.texto}>
            Opsi lee los productos y te los enseña para que los revises. No se guarda nada hasta que tú lo confirmes.
          </Text>
          <View style={styles.aviso}>
            <Text style={styles.avisoTitulo}>Antes de hacer la foto</Text>
            <Text style={styles.texto}>
              La foto se envía a un servicio de IA para leerla. Opsi no la guarda en ningún sitio.
            </Text>
            <Text style={styles.texto}>
              Un ticket puede llevar datos que no quieras compartir (la tarjeta, un número de cliente). Si es así,
              tápalos al hacer la foto.
            </Text>
          </View>
          <ErrorNote message={error} />
          <Button label="Entendido, hacer la foto" onPress={() => void empezar()} icon={<Camera size={20} color={c.ground} weight="bold" />} />
        </ScrollView>
      ) : null}

      {fase === 'leyendo' ? (
        <View style={styles.centro}>
          <ActivityIndicator color={c.brand} size="large" />
          <Text style={styles.texto}>Leyendo el ticket…</Text>
        </View>
      ) : null}

      {fase === 'revisar' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.revision}>
          <ScrollView contentContainerStyle={styles.cuerpo} keyboardShouldPersistTaps="handled">
            <Text style={t.title}>Esto he leído</Text>
            <Text style={styles.texto}>
              Corrige lo que haga falta, quita lo que sobre y añade lo que falte. Lo que no parece comida sale sin marcar.
              No se guarda nada hasta que pulses el botón.
            </Text>

            {marcas.tiendaVisible !== null ? (
              <View style={styles.tienda}>
                <Storefront size={16} color={c.inkMuted} weight="duotone" />
                <Text style={styles.tiendaTexto} numberOfLines={1}>
                  Tienda: {marcas.tiendaVisible}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Quitar la tienda" onPress={marcas.quitarTienda} hitSlop={10}>
                  <X size={14} color={c.inkMuted} weight="bold" />
                </Pressable>
              </View>
            ) : null}
            {buscandoMarcas > 0 || marcas.aviso !== null ? (
              <View style={styles.progreso} accessibilityLiveRegion="polite">
                {buscandoMarcas > 0 ? <ActivityIndicator size="small" color={c.inkMuted} /> : null}
                <Text style={styles.progresoTexto}>
                  {marcas.aviso ?? `Buscando marcas… (${buscandoMarcas} por mirar). Puedes revisar mientras tanto.`}
                </Text>
              </View>
            ) : null}

            {lineas.map((l) => (
              <FilaRevision
                key={l.clave}
                linea={l}
                onCambiar={(cambios) => cambiar(l.clave, cambios)}
                onConfirmarMarca={() => cambiarLineas((actuales) => confirmarSugerida(actuales, l.clave))}
                onAbrirMarca={() => setFilaDeMarca(l.clave)}
                onBuscarMarca={() => marcas.buscarUna(l.clave)}
              />
            ))}

            <Pressable accessibilityRole="button" accessibilityLabel="Añadir una línea" onPress={otraLinea} style={styles.anadir}>
              <Plus size={16} color={c.brandInk} weight="bold" />
              <Text style={styles.anadirTexto}>Añadir una línea</Text>
            </Pressable>

            {aTachar.length > 0 ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: tachar }}
                onPress={() => setTachar((v) => !v)}
                style={styles.tachar}
              >
                <View style={[styles.casilla, tachar && styles.casillaOn]}>
                  {tachar ? <Check size={14} color={c.onBrand} weight="bold" /> : null}
                </View>
                <View style={styles.textoTachar}>
                  <Text style={styles.nombreTachar}>Tachar de mis listas lo que ya has comprado</Text>
                  <Text style={styles.detalleTachar} numberOfLines={3}>
                    {aTachar.map((p) => p.name).join(', ')}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <ErrorNote message={error} />
          </ScrollView>

          <HojaMarca
            // Una hoja por fila: lo que se escribió en una no se queda en el campo de la siguiente.
            key={filaAbierta?.clave ?? 'cerrada'}
            linea={filaAbierta}
            onClose={() => setFilaDeMarca(null)}
            onElegir={(candidato) => enFila((actuales, clave) => elegirCandidato(actuales, clave, candidato))}
            onEscribir={(marca) => enFila((actuales, clave) => escribirMarca(actuales, clave, marca))}
            onSinIdentificar={() => enFila((actuales, clave) => dejarSinIdentificar(actuales, clave))}
            onBuscar={() => {
              const clave = filaDeMarca;
              setFilaDeMarca(null);
              if (clave !== null) marcas.buscarUna(clave);
            }}
          />

          <SafeAreaView edges={['bottom']} style={styles.pie}>
            <Button
              label={
                aGuardar.length === 0
                  ? 'Marca algo para guardar'
                  : `Guardar ${aGuardar.length} ${aGuardar.length === 1 ? 'producto' : 'productos'} en ${activa.name}`
              }
              onPress={() => guardar.mutate()}
              loading={guardar.isPending}
              disabled={aGuardar.length === 0}
            />
            <Button
              label="Hacer otra foto"
              variant="quiet"
              onPress={() => {
                marcas.cancelar();
                setFase('aviso');
              }}
              disabled={guardar.isPending}
            />
          </SafeAreaView>
        </KeyboardAvoidingView>
      ) : null}

      {fase === 'hecho' ? (
        <View style={styles.centro}>
          <View style={styles.icono}>
            <Check size={32} color={c.brand} weight="bold" />
          </View>
          <Text style={t.title}>Hecho</Text>
          <Text style={[styles.texto, styles.centrado]}>{resumen}</Text>
          <Button label="Listo" onPress={cerrar} />
        </View>
      ) : null}
    </View>
  );
}

/** Cómo se dice por qué una línea no es un producto, para decírselo a la persona. */
function textoNoProducto(motivo: string): string {
  switch (motivo) {
    case 'descuento':
      return 'descuento';
    case 'total':
      return 'total o subtotal';
    case 'impuesto':
      return 'impuesto';
    case 'pago':
      return 'medio de pago';
    case 'mensaje':
      return 'mensaje del recibo';
    default:
      return 'importe suelto';
  }
}

/** Una línea del ticket: casilla, nombre, cantidad, unidad y marca, todo editable. */
function FilaRevision({
  linea,
  onCambiar,
  onConfirmarMarca,
  onAbrirMarca,
  onBuscarMarca,
}: {
  linea: LineaRevision;
  onCambiar: (cambios: Partial<LineaRevision>) => void;
  onConfirmarMarca: () => void;
  onAbrirMarca: () => void;
  onBuscarMarca: () => void;
}) {
  const styles = useStyles();
  const c = useTheme();
  const bloqueada = bloqueadaPorNombre(linea);
  const guardada = linea.guardada === true;
  const marcada = linea.incluir && !bloqueada;

  return (
    <View style={[styles.fila, guardada && styles.filaGuardada]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: marcada || guardada, disabled: bloqueada || guardada }}
        accessibilityLabel={linea.nombre || 'Línea sin nombre'}
        onPress={() => onCambiar({ incluir: !linea.incluir })}
        disabled={bloqueada || guardada}
        hitSlop={6}
        style={[styles.casilla, (marcada || guardada) && styles.casillaOn]}
      >
        {marcada || guardada ? <Check size={14} color={c.onBrand} weight="bold" /> : null}
      </Pressable>

      <View style={styles.filaTexto}>
        <TextInput
          accessibilityLabel="Nombre del producto"
          value={linea.nombre}
          onChangeText={(nombre) => onCambiar({ nombre })}
          editable={!guardada}
          placeholder="Producto"
          placeholderTextColor={c.inkFaint}
          maxLength={80}
          style={styles.nombre}
        />
        {/* Lo que decía el ticket, sin tocar: es la evidencia de la que sale todo lo demás. */}
        {linea.texto !== undefined || linea.precio !== undefined ? (
          <Text style={styles.nota} numberOfLines={1}>
            Ticket: {[linea.texto, linea.precio !== undefined ? `${linea.precio.toFixed(2).replace('.', ',')} €` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {guardada ? <Text style={styles.nota}>Guardado</Text> : null}
        {bloqueada ? <Text style={styles.nota}>Opsi solo guarda comida y bebida.</Text> : null}
        {!bloqueada && !guardada && !linea.comida ? <Text style={styles.nota}>No parece comida.</Text> : null}
        {linea.avisoNoProducto !== undefined && !guardada ? (
          <Text style={styles.nota}>Esto parece un {textoNoProducto(linea.avisoNoProducto)}, no un producto. Márcalo si me equivoco.</Text>
        ) : null}
        {/* La marca solo tiene sentido en lo que se come, y en una línea añadida a mano cuando ya tiene nombre. */}
        {linea.comida && !bloqueada && !guardada && (linea.busqueda !== 'no_aplica' || linea.nombre.trim() !== '') ? (
          <BloqueMarca linea={linea} onConfirmar={onConfirmarMarca} onAbrir={onAbrirMarca} onBuscar={onBuscarMarca} />
        ) : null}
      </View>

      <TextInput
        accessibilityLabel="Cantidad"
        value={linea.cantidad}
        onChangeText={(cantidad) => onCambiar({ cantidad })}
        editable={!guardada}
        keyboardType="decimal-pad"
        placeholder="1"
        placeholderTextColor={c.inkFaint}
        maxLength={8}
        style={styles.cantidad}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Unidad: ${linea.unidad}. Tocar para cambiarla`}
        onPress={() => onCambiar({ unidad: siguienteUnidad(linea.unidad) })}
        disabled={guardada}
        style={styles.unidad}
      >
        <Text style={styles.unidadTexto}>{ETIQUETA_UNIDAD[linea.unidad]}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  raiz: { flex: 1, backgroundColor: c.ground },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
  },
  redondo: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceAlt },
  cuerpo: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl },
  centrado: { textAlign: 'center' },
  texto: { fontSize: 14.5, lineHeight: 21, color: c.inkMuted },
  icono: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft },
  panel: {
    gap: space.md,
    marginHorizontal: space.xl,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  aviso: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  avisoTitulo: { fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },

  camaraRaiz: { flex: 1, backgroundColor: '#000000' },
  camara: { ...{ position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 } },
  camaraBarra: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl },
  camaraTitulo: { flex: 1, textAlign: 'center', fontFamily: fonts.semibold, fontSize: 14, color: '#FFFFFF', paddingHorizontal: space.sm },
  redondoOscuro: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  camaraPie: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: space.lg },
  disparador: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: c.brand, borderWidth: 4, borderColor: '#FFFFFF' },

  revision: { flex: 1 },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  filaGuardada: { opacity: 0.6 },
  casilla: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' },
  casillaOn: { backgroundColor: c.brand, borderColor: c.brand },
  filaTexto: { flex: 1, minWidth: 0, gap: 1 },
  nombre: { fontFamily: fonts.medium, fontSize: 15, color: c.ink, paddingVertical: 6 },
  nota: { fontSize: 11.5, color: c.inkMuted },
  cantidad: {
    width: 54,
    minHeight: touchTarget - 8,
    textAlign: 'center',
    fontSize: 15,
    color: c.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.ground,
  },
  unidad: { minWidth: 40, minHeight: touchTarget - 8, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: c.surfaceAlt, paddingHorizontal: 6 },
  unidadTexto: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  tienda: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surfaceAlt },
  tiendaTexto: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: c.inkMuted },
  progreso: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  progresoTexto: { flex: 1, fontSize: 12.5, lineHeight: 17, color: c.inkMuted },
  anadir: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: touchTarget, alignSelf: 'flex-start' },
  anadirTexto: { fontFamily: fonts.semibold, fontSize: 14, color: c.brandInk },
  tachar: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  textoTachar: { flex: 1, minWidth: 0, gap: 2 },
  nombreTachar: { fontFamily: fonts.semibold, fontSize: 14, color: c.ink },
  detalleTachar: { fontSize: 12.5, color: c.inkMuted },
  pie: { gap: space.xs, paddingHorizontal: space.xl, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.ground },
}));

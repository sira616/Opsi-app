import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Barcode, CheckCircle, Keyboard, Lightning, LightningSlash, X } from 'phosphor-react-native';

import {
  buscarPorCodigo,
  buscarProductoPrivado,
  ErrorBusqueda,
  type ProductoEscaneado,
} from '@/api/catalogo';
import { HojaAltaRapida, type Elegido } from '@/features/alta/HojaAltaRapida';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { describeDbError } from '@/shared/lib/db-errors';
import { esCodigoDeNoComida, normalizarGtin } from '@/shared/lib/gtin';
import { tomarGuardado } from '@/shared/lib/ultimo-guardado';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

/**
 * Leer un código de barras y llevarlo al alta.
 *
 * La cámara es una COMODIDAD, no el camino: escribir el código a mano está
 * siempre a un toque, y es la única vía en el navegador, para quien no da
 * permiso a la cámara y para quien no puede apuntar con precisión. Una pantalla
 * que solo sirve con cámara deja fuera a más gente de la que parece.
 *
 * Lo que llega de la cámara es entrada no confiable igual que lo que llega de
 * un teclado: se normaliza y se valida (`normalizarGtin`) ANTES de gastar una
 * consulta, y se ignora en silencio lo que no cuadra —una lectura sucia no es
 * un error de la persona—.
 *
 * Resolución, de lo más barato a lo más caro (ver `api/catalogo.ts`): un
 * producto privado de la nevera, luego el catálogo global a través de la Edge
 * Function. Un producto conocido se confirma en una hoja pequeña (`HojaAltaRapida`)
 * con todo ya puesto; si nadie lo conoce, el alta se abre con el código ya puesto.
 * Un libro, un cupón o lo que el catálogo sabe que no es comida se rechaza: Opsi
 * solo guarda comida.
 *
 * El formulario completo se abre ENCIMA del escáner (no lo sustituye): al guardar se
 * vuelve a él para seguir con el siguiente producto, y su cámara se apaga mientras
 * tanto.
 */

type Estado =
  | { tipo: 'leyendo' }
  | { tipo: 'buscando'; codigo: string }
  | { tipo: 'ficha'; codigo: string; producto: ProductoEscaneado }
  | { tipo: 'no_comida'; codigo: string }
  | { tipo: 'fallo'; codigo: string; mensaje: string };

/** Tras leer algo, hasta que no se vuelva a aceptar el mismo código. */
const ESPERA_MISMA_LECTURA_MS = 2500;
/** Cuántas lecturas malas seguidas hacen falta para ofrecer ayuda. */
const LECTURAS_MALAS_PARA_AYUDA = 6;

export default function Escanear() {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();
  const { activa } = useNeveraActual();
  const [permiso, pedirPermiso] = useCameraPermissions();

  // En el navegador no hay lector: según la documentación de la librería que usa
  // `expo-camera` en la web, baja un módulo WASM de un CDN en ejecución, y código
  // que no controlamos no se ejecuta en la página. Solo entrada a mano (D-34).
  const hayCamara = Platform.OS !== 'web';
  const [manual, setManual] = useState(!hayCamara);
  const [linterna, setLinterna] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: 'leyendo' });
  const [lecturasMalas, setLecturasMalas] = useState(0);
  // Lo último que se guardó desde aquí, para decírselo a la persona un momento.
  const [aviso, setAviso] = useState<string | null>(null);
  const [enfocada, setEnfocada] = useState(true);
  const primeraVez = useRef(true);

  const ultima = useRef<{ codigo: string; en: number } | null>(null);
  const viva = useRef(true);
  useEffect(() => {
    viva.current = true;
    return () => {
      viva.current = false;
    };
  }, []);

  // Al volver de rellenar el formulario completo el escáner sigue donde estaba, listo
  // para el siguiente, y dice qué se acaba de guardar. La cámara solo está encendida
  // mientras esta pantalla es la que se ve.
  useFocusEffect(
    useCallback(() => {
      setEnfocada(true);
      if (primeraVez.current) {
        primeraVez.current = false;
        // Lo que hubiera guardado antes de abrir el escáner no es de esta visita.
        tomarGuardado();
      } else {
        setEstado({ tipo: 'leyendo' });
        const guardado = tomarGuardado();
        if (guardado) setAviso(guardado);
      }
      return () => setEnfocada(false);
    }, []),
  );

  useEffect(() => {
    if (aviso === null) return;
    const temporizador = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  const irAAlta = useCallback(
    (params: { codigo: string; producto?: string; donde?: string; dias?: string }) => {
      router.push({ pathname: '/alta', params });
    },
    [router],
  );

  // Si la cámara sigue apuntando al mismo código, no se vuelve a abrir al instante.
  const cerrarFicha = useCallback(() => {
    if (ultima.current) ultima.current = { ...ultima.current, en: Date.now() + 1500 };
    setEstado({ tipo: 'leyendo' });
  }, []);

  const resolver = useCallback(
    async (codigo: string) => {
      // Un libro o un cupón se rechaza al instante, sin preguntar a nadie.
      if (esCodigoDeNoComida(codigo)) return setEstado({ tipo: 'no_comida', codigo });

      setEstado({ tipo: 'buscando', codigo });
      try {
        // 1. Lo que esta nevera ya conoce: lectura normal, sin cuota.
        const privado = await buscarProductoPrivado(activa.id, codigo);
        if (!viva.current) return;
        if (privado) return setEstado({ tipo: 'ficha', codigo, producto: privado });

        // 2. El catálogo global, vía la Edge Function.
        const r = await buscarPorCodigo(codigo);
        if (!viva.current) return;
        if (r.encontrado) return setEstado({ tipo: 'ficha', codigo, producto: r.producto });
        if (r.noEsComida) return setEstado({ tipo: 'no_comida', codigo });

        // 3. Nadie lo conoce: a mano, con el código puesto. Se vuelve a leer al regresar.
        setEstado({ tipo: 'leyendo' });
        irAAlta({ codigo });
      } catch (error) {
        if (!viva.current) return;
        const mensaje = error instanceof ErrorBusqueda ? error.message : describeDbError(error);
        setEstado({ tipo: 'fallo', codigo, mensaje });
      }
    },
    [activa.id, irAAlta],
  );

  const alLeer = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const codigo = normalizarGtin(data);
      if (codigo === null) {
        setLecturasMalas((n) => n + 1);
        return;
      }
      const ahora = Date.now();
      const anterior = ultima.current;
      if (anterior && anterior.codigo === codigo && ahora - anterior.en < ESPERA_MISMA_LECTURA_MS) {
        return;
      }
      ultima.current = { codigo, en: ahora };
      setLecturasMalas(0);
      void resolver(codigo);
    },
    [resolver],
  );

  const volver = useCallback(() => router.back(), [router]);

  // ── Sin permiso de cámara ───────────────────────────────────────────────
  const sinPermiso = hayCamara && permiso !== null && !permiso.granted;
  const pendientePermiso = hayCamara && permiso === null;
  const verCamara = hayCamara && !manual && permiso?.granted === true;
  // Los paneles de entrada (manual, permiso) solo salen cuando no hay otra cosa que
  // atender: una ficha, un rechazo o un fallo.
  const libre = estado.tipo === 'leyendo' || estado.tipo === 'buscando';

  return (
    <View style={styles.raiz}>
      {/* Sin cámara el fondo es el del tema, no negro. */}
      {verCamara ? null : <View style={[styles.relleno, { backgroundColor: c.ground }]} />}

      {verCamara && enfocada ? (
        <CameraView
          style={styles.camara}
          facing="back"
          enableTorch={linterna}
          // Los formatos de un supermercado: EAN-13 (los de aquí), EAN-8 (lo
          // pequeño) y UPC-A (lo importado). El resto —QR, Code128— no son
          // productos, y leerlos solo daría falsos positivos.
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
          onBarcodeScanned={estado.tipo === 'leyendo' ? alLeer : undefined}
          accessibilityLabel="Cámara para leer el código de barras"
        />
      ) : null}

      <SafeAreaView style={[styles.capa, !verCamara && styles.capaSinCamara]}>
        {/* ── Barra superior ─────────────────────────────────────────── */}
        <View style={styles.barra}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar el escáner"
            onPress={volver}
            style={styles.redondo}
          >
            <X size={22} color="#FFFFFF" weight="bold" />
          </Pressable>
          <Text style={styles.barraTitulo}>Escanear</Text>
          {verCamara ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: linterna }}
              accessibilityLabel="Linterna"
              onPress={() => setLinterna((v) => !v)}
              style={styles.redondo}
            >
              {linterna ? (
                <Lightning size={22} color="#FFFFFF" weight="fill" />
              ) : (
                <LightningSlash size={22} color="#FFFFFF" weight="bold" />
              )}
            </Pressable>
          ) : (
            <View style={styles.redondo} />
          )}
        </View>

        {/* ── Centro: el marco y el consejo. Sin cámara no hay centro. ── */}
        {verCamara ? (
          <View style={styles.centro}>
            <View style={styles.marco} />
            <Text style={styles.consejo}>
              {estado.tipo === 'buscando'
                ? 'Buscando…'
                : lecturasMalas >= LECTURAS_MALAS_PARA_AYUDA
                  ? 'Lo veo, pero no me cuadra. Prueba con más luz o escribe el código.'
                  : 'Apunta al código de barras'}
            </Text>
          </View>
        ) : null}

        {/* ── Abajo ──────────────────────────────────────────────────── */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.hoja}
            bounces={false}
          >
            {aviso !== null ? (
              <View style={styles.aviso} accessibilityLiveRegion="polite">
                <CheckCircle size={20} color={c.ground} weight="fill" />
                <Text style={styles.avisoTexto} numberOfLines={2}>
                  Guardado: {aviso}
                </Text>
              </View>
            ) : null}

            {estado.tipo === 'no_comida' ? (
              <View style={styles.bloque}>
                <Text style={styles.hojaTitulo}>Eso no es comida</Text>
                <Text style={styles.hojaTexto}>Opsi solo guarda comida y bebida.</Text>
                <Button label="Escanear otro" onPress={() => setEstado({ tipo: 'leyendo' })} />
              </View>
            ) : null}

            {estado.tipo === 'fallo' ? (
              <View style={styles.bloque}>
                <ErrorNote message={estado.mensaje} />
                <Button
                  label="Probar otra vez"
                  onPress={() => void resolver(estado.codigo)}
                />
                <Button
                  label="Añadirlo a mano con este código"
                  variant="quiet"
                  onPress={() => irAAlta({ codigo: estado.codigo })}
                />
              </View>
            ) : null}

            {libre && (sinPermiso || pendientePermiso) && !manual ? (
              <View style={styles.bloque}>
                <Text style={styles.hojaTitulo}>Necesito la cámara para leer el código</Text>
                <Text style={styles.hojaTexto}>
                  Solo se usa para ver el código de barras. No se guarda ninguna foto ni sale del
                  móvil. Si prefieres, puedes escribir los números.
                </Text>
                {permiso && !permiso.canAskAgain ? (
                  <Button label="Abrir los ajustes del móvil" onPress={() => void Linking.openSettings()} />
                ) : (
                  <Button label="Permitir la cámara" onPress={() => void pedirPermiso()} />
                )}
              </View>
            ) : null}

            {manual && libre ? (
              <EntradaManual
                ocupada={estado.tipo === 'buscando'}
                onBuscar={(codigo) => void resolver(codigo)}
                avisoSinCamara={!hayCamara}
              />
            ) : null}

            {!manual && libre ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setManual(true)}
                style={styles.enlace}
              >
                <Keyboard size={18} color="#FFFFFF" weight="bold" />
                <Text style={styles.enlaceTexto}>Escribir el código a mano</Text>
              </Pressable>
            ) : null}

            {manual && hayCamara && libre ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setManual(false)}
                style={styles.enlace}
              >
                <Barcode size={18} color="#FFFFFF" weight="bold" />
                <Text style={styles.enlaceTexto}>Volver a la cámara</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Un producto conocido: todo puesto, y un botón para decir que está bien. */}
      {estado.tipo === 'ficha' ? (
        <HojaAltaRapida
          key={estado.producto.id}
          onClose={cerrarFicha}
          nombre={estado.producto.name}
          marca={estado.producto.brand}
          productoId={estado.producto.id}
          unitFamily={estado.producto.unit_family}
          netQuantity={estado.producto.net_quantity}
          onEditar={(elegido: Elegido) => {
            const { codigo, producto } = estado;
            cerrarFicha();
            irAAlta({
              codigo,
              producto: producto.id,
              donde: elegido.location,
              ...(elegido.dias !== null ? { dias: String(elegido.dias) } : {}),
            });
          }}
          onGuardado={(nombre) => {
            cerrarFicha();
            setAviso(nombre);
          }}
        />
      ) : null}
    </View>
  );
}

function EntradaManual({
  ocupada,
  onBuscar,
  avisoSinCamara,
}: {
  ocupada: boolean;
  onBuscar: (codigo: string) => void;
  avisoSinCamara: boolean;
}) {
  const styles = useStyles();
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  function enviar() {
    const codigo = normalizarGtin(texto);
    if (codigo === null) {
      setAviso(
        texto.trim() === ''
          ? 'Escribe los números que hay debajo de las barras.'
          : 'Ese código no cuadra. Revisa los números: el último es de control y suele ser el que se escapa.',
      );
      return;
    }
    setAviso(null);
    onBuscar(codigo);
  }

  return (
    <View style={styles.bloque}>
      <Text style={styles.hojaTitulo}>Escribe el código</Text>
      {avisoSinCamara ? (
        <Text style={styles.hojaTexto}>
          Aquí no hay cámara. Los números van debajo de las barras (8 o 13 cifras).
        </Text>
      ) : null}
      <TextField
        label="Código de barras"
        hint={aviso ?? 'Solo los números, sin espacios.'}
        value={texto}
        onChangeText={(v) => {
          setTexto(v.replace(/\D/g, '').slice(0, 14));
          setAviso(null);
        }}
        placeholder="8412345678905"
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={14}
        returnKeyType="search"
        onSubmitEditing={enviar}
        autoFocus={avisoSinCamara}
      />
      <Button label="Buscar" onPress={enviar} loading={ocupada} disabled={texto.length < 8} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  raiz: { flex: 1, backgroundColor: '#000000' },
  camara: StyleSheet.absoluteFill,
  relleno: StyleSheet.absoluteFill,
  capa: { flex: 1, justifyContent: 'space-between' },
  // Sin cámara no hay marco que separe la barra de la hoja: la hoja sube.
  capaSinCamara: { justifyContent: 'flex-start', gap: space.lg },

  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  barraTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: '#FFFFFF' },
  redondo: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // El centro no recibe toques: deja pasar los de la cámara que tiene debajo.
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    pointerEvents: 'none',
  },
  marco: {
    width: '78%',
    aspectRatio: 1.6,
    borderRadius: radius.lg + 4,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  consejo: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
    // Sobre una imagen cualquiera, un texto blanco solo se lee con un fondo.
    backgroundColor: 'rgba(0,0,0,0.55)',
    maxWidth: '86%',
  },

  hoja: { gap: space.md, padding: space.lg },
  bloque: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg + 4,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
  },
  avisoTexto: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: c.ground },
  hojaTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  hojaTexto: { fontSize: 14, lineHeight: 20, color: c.inkMuted },
  enlace: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: space.lg,
    alignSelf: 'center',
  },
  enlaceTexto: { fontFamily: fonts.semibold, fontSize: 14, color: '#FFFFFF' },
}));

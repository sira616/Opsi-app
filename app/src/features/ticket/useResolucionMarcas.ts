import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorMarcas, resolverMarcas } from '@/api/marcas';

import type { LineaRevision } from './lineas';
import {
  aplicarResoluciones,
  esperaDe,
  marcarBuscando,
  marcarFallidas,
  siguienteTanda,
  volverABuscar,
  type RespuestaMarcas,
} from './marcas';

/** Cuánto se espera como mínimo y como máximo entre dos intentos cuando el cupo de búsquedas se agota. */
const ESPERA_MIN_S = 10;
const ESPERA_MAX_S = 70;
/** Si el servidor dice que hay que esperar más que esto (el tope por hora), no se espera: se dice. */
const ESPERA_LIMITE_S = 180;
/** Cuántas veces como mucho se espera al cupo en un mismo ticket. */
const MAX_ESPERAS = 4;

type Params = {
  neveraId: string;
  /** Las filas de ahora mismo, leídas sin esperar a un render (la pantalla las guarda en una ref). */
  leer: () => LineaRevision[];
  cambiar: (f: (lineas: LineaRevision[]) => LineaRevision[]) => void;
};

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Busca la marca de las filas del ticket por tandas, SIN bloquear la pantalla: la revisión está a la vista
 * desde el primer momento y las marcas van llegando.
 *
 * Los límites son de Open Food Facts (10 búsquedas por minuto entre todas las personas), no una elección:
 * un ticket de 24 líneas no cabe de una vez. Cuando el servidor dice «sin cupo» las líneas quedan pendientes,
 * se espera lo que él indica (acotado) y se vuelve a pedir; si dice que falta mucho (el tope de la hora), se
 * deja de insistir y las filas siguen, sin marca, con un botón para buscar a mano.
 *
 * Lo que la persona decide mientras tanto manda: `aplicarResoluciones` no pisa una elección suya.
 */
export function useResolucionMarcas(params: Params) {
  const ultimos = useRef(params);
  useEffect(() => {
    ultimos.current = params;
  });

  const generacion = useRef(0);
  const corriendo = useRef(false);
  const tiendaNombre = useRef<string | null>(null);
  const tiendaQuitada = useRef(false);

  const [tiendaClave, setTiendaClave] = useState('');
  const [tiendaVisible, setTiendaVisible] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cancelar = useCallback(() => {
    generacion.current += 1;
    corriendo.current = false;
    setTrabajando(false);
    setAviso(null);
  }, []);

  // Al salir de la pantalla no se sigue pidiendo.
  useEffect(() => cancelar, [cancelar]);

  /** Una tienda nueva (otro ticket): se olvida la anterior. */
  const fijarTienda = useCallback((nombre: string | null) => {
    tiendaNombre.current = nombre;
    tiendaQuitada.current = false;
    setTiendaVisible(nombre);
    setTiendaClave('');
  }, []);

  const quitarTienda = useCallback(() => {
    tiendaNombre.current = null;
    tiendaQuitada.current = true;
    setTiendaVisible(null);
    setTiendaClave('');
  }, []);

  const iniciar = useCallback(async () => {
    // Si ya hay un ciclo en marcha, lo que se haya puesto como pendiente lo recoge él en su próxima vuelta.
    if (corriendo.current) return;
    corriendo.current = true;
    generacion.current += 1;
    const mia = generacion.current;
    setTrabajando(true);
    setAviso(null);
    let esperas = 0;

    const vigente = () => mia === generacion.current;
    const dejarPendientesSinMarca = () => {
      const ids = siguienteTanda(ultimos.current.leer(), 1000).map((l) => l.id);
      ultimos.current.cambiar((l) => marcarFallidas(l, ids));
    };

    try {
      for (;;) {
        if (!vigente()) return;
        const tanda = siguienteTanda(ultimos.current.leer());
        if (tanda.length === 0) break;
        const ids = tanda.map((l) => l.id);
        ultimos.current.cambiar((l) => marcarBuscando(l, ids));

        let respuesta: RespuestaMarcas;
        try {
          respuesta = await resolverMarcas({
            nevera: ultimos.current.neveraId,
            tienda: tiendaNombre.current,
            lineas: tanda,
          });
        } catch (e) {
          if (!vigente()) return;
          ultimos.current.cambiar((l) => marcarFallidas(l, ids));
          // Sin plan o sin sesión no tiene sentido seguir con las demás tandas.
          if (e instanceof ErrorMarcas && e.causa !== 'otro') {
            dejarPendientesSinMarca();
            break;
          }
          continue;
        }
        if (!vigente()) return;

        if (!tiendaQuitada.current && respuesta.tiendaClave !== '') setTiendaClave((previa) => previa || respuesta.tiendaClave);
        ultimos.current.cambiar((l) => aplicarResoluciones(l, respuesta.lineas));

        if (respuesta.lineas.some((r) => r.reintentable)) {
          const espera = esperaDe(respuesta.lineas);
          if (espera === null || espera > ESPERA_LIMITE_S || esperas >= MAX_ESPERAS) {
            dejarPendientesSinMarca();
            setAviso('Has llegado al límite de búsquedas por ahora. Puedes buscar la marca de cada producto más tarde.');
            break;
          }
          esperas += 1;
          setAviso('Esperando un momento para seguir buscando marcas…');
          await dormir(Math.min(Math.max(espera, ESPERA_MIN_S), ESPERA_MAX_S) * 1000);
          if (!vigente()) return;
          setAviso(null);
        }
      }
    } finally {
      if (vigente()) {
        corriendo.current = false;
        setTrabajando(false);
      }
    }
  }, []);

  /** Busca otra vez la marca de UNA fila (con el nombre que tenga ahora). */
  const buscarUna = useCallback(
    (clave: string) => {
      ultimos.current.cambiar((l) => volverABuscar(l, clave));
      void iniciar();
    },
    [iniciar],
  );

  return { iniciar, cancelar, buscarUna, fijarTienda, quitarTienda, tiendaClave, tiendaVisible, trabajando, aviso };
}

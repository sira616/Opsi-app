import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lo que recuerda ESTE dispositivo sobre los avisos de la app: si están encendidos y qué
 * día se enseñó el último. Es del aparato, no de la cuenta (como el aspecto claro u oscuro):
 * no necesita viajar entre dispositivos, funciona sin conexión y no pide una migración.
 *
 * El almacenamiento puede fallar o no estar (navegación privada, datos bloqueados): todo
 * va con `try/catch` y, si falla, la app sigue con los valores por omisión. Un aviso que
 * no se puede apagar es peor que uno que se enseña de más; por eso, sin poder leerlo, se
 * enseña, y sin poder escribir el día, simplemente puede repetirse.
 */

const CLAVE_ACTIVOS = 'opsi.avisos.activos';
const CLAVE_DIA = 'opsi.avisos.dia';

/** Encendidos por omisión: la persona los apaga si no los quiere. */
export async function leerAvisosActivos(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CLAVE_ACTIVOS)) !== '0';
  } catch {
    return true;
  }
}

export async function guardarAvisosActivos(activos: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_ACTIVOS, activos ? '1' : '0');
  } catch {
    // Sin almacenamiento no se puede recordar: la próxima vez vuelve a estar encendido.
  }
}

/** El día («aaaa-mm-dd») en que se enseñó el último aviso en este dispositivo, o null. */
export async function leerDiaAviso(): Promise<string | null> {
  try {
    const dia = await AsyncStorage.getItem(CLAVE_DIA);
    return dia !== null && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
  } catch {
    return null;
  }
}

export async function guardarDiaAviso(dia: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CLAVE_DIA, dia);
  } catch {
    // Igual: sin poder recordarlo, puede volver a salir hoy.
  }
}

/**
 * Adónde puede ir un producto del almacén, sin pantalla ni red: solo la regla.
 *
 * Un producto escaneado se enlaza a una ficha del catálogo. Si esa ficha es del catálogo
 * global (`openfoodfacts`) vale en cualquier nevera; si la creó una nevera (`user`, un código
 * que nadie conocía) es privada de ella y el servidor la rechaza desde otra. En ese caso se
 * añade solo con su nombre, sin enlazar. Lo escrito a mano no tiene ficha.
 */
export function productoParaNevera(
  p: { productoId: string | null; origen: string | null },
  destinoId: string,
  origenId: string,
): string | null {
  if (p.productoId === null) return null;
  return p.origen === 'openfoodfacts' || destinoId === origenId ? p.productoId : null;
}

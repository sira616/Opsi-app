/**
 * Adónde puede ir un producto del almacén, sin pantalla ni red: solo la regla.
 *
 * Un producto escaneado se enlaza a una ficha del catálogo. Si esa ficha es del catálogo
 * global (`openfoodfacts`) vale en cualquier nevera; si la creó una nevera (`user`, un código
 * que nadie conocía) es privada de ella y el servidor la rechaza desde otra. En ese caso se
 * añade solo con su nombre, sin enlazar. Lo escrito a mano no tiene ficha.
 *
 * `neveraId` es la nevera en la que se añadió el producto la última vez (los productos son de
 * la cuenta y pueden venir de cualquiera de sus neveras): es de donde es la ficha privada.
 */
export function productoParaNevera(
  p: { productoId: string | null; origen: string | null; neveraId: string | null },
  destinoId: string,
): string | null {
  if (p.productoId === null) return null;
  return p.origen === 'openfoodfacts' || destinoId === p.neveraId ? p.productoId : null;
}

/**
 * Lo mismo, pero para apuntarlo en una lista. Una lista compartida es de una nevera y vale la
 * regla de arriba. Una individual no cuelga de ninguna: sirve la ficha que la persona ya ve
 * (la global, o la privada de una nevera suya), que es de donde sale el producto.
 */
export function productoParaLista(
  p: { productoId: string | null; origen: string | null; neveraId: string | null },
  lista: { household_id: string | null },
): string | null {
  return lista.household_id === null ? p.productoId : productoParaNevera(p, lista.household_id);
}

/**
 * El producto de un alimento que ya está en una nevera, para apuntarlo en una lista. No se sabe
 * si su ficha es global o privada de esa nevera, así que solo se enlaza donde seguro vale: en
 * una lista individual o en una compartida de la MISMA nevera. En la de otra se apunta por el
 * nombre, que es lo que el servidor admitiría igualmente si la ficha fuera privada.
 */
export function productoDelElementoParaLista(
  e: { product_id: string | null; household_id: string },
  lista: { household_id: string | null },
): string | null {
  return lista.household_id === null || lista.household_id === e.household_id ? e.product_id : null;
}

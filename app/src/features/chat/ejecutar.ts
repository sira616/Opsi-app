import type { QueryClient } from '@tanstack/react-query';

import type { Nevera } from '@/api/household';
import { actions, createItem } from '@/api/inventory';
import { agregarLinea, fetchListas } from '@/api/lista';
import { ubicacionSugerida } from '@/features/alta/valores';
import { listaPorDefecto } from '@/features/lista/listas';
import { adivinarCategoria } from '@/shared/lib/categorias';
import { queryKeys } from '@/shared/lib/query';

import { cantidadParaGuardar, unidadDeApp, type PropuestaChat } from './propuestas';
import { toBase } from '@/shared/lib/units';

/**
 * Hace lo que la persona acaba de CONFIRMAR en una tarjeta del chat.
 *
 * Es la única vía por la que el chat cambia algo, y no la usa el modelo: la llama la pantalla al
 * tocar «Sí», con la sesión de la persona, y va por las MISMAS funciones que el resto de la app
 * (`createItem`, `actions.use`, `actions.finish`, `actions.discard`, `agregarLinea`). Así valen sus
 * mismas reglas y sus mismos errores: lo que el servidor rechazaría desde una pantalla lo rechaza
 * desde aquí. Si algo falla a medias, lo ya hecho se queda hecho y el error sale tal cual.
 *
 * Devuelve una frase corta que dice qué se hizo.
 */
export async function ejecutarPropuesta(
  p: PropuestaChat,
  contexto: { nevera: Nevera; queryClient: QueryClient; invalidar?: boolean },
): Promise<string> {
  const { nevera, queryClient } = contexto;
  try {
    switch (p.tipo) {
      case 'apuntar': {
        // Las listas son de la cuenta: se apunta en la de siempre (la compartida de esta nevera o la individual).
        const listas = await queryClient.fetchQuery({ queryKey: queryKeys.listas, queryFn: fetchListas });
        const lista = listaPorDefecto(listas, nevera.id);
        if (!lista) throw new Error('No tienes ninguna lista donde apuntarlo.');
        let nuevas = 0;
        for (const l of p.productos) {
          const cantidad =
            l.cantidad !== null && l.unidad !== null ? cantidadParaGuardar(l.cantidad, l.unidad) : null;
          const apuntada = await agregarLinea({ lista, name: l.nombre, origen: 'chat', cantidad });
          if (apuntada) nuevas += 1;
        }
        return nuevas === 0
          ? `Ya estaba apuntado en «${lista.name}».`
          : `Apuntado en «${lista.name}»: ${nuevas} ${nuevas === 1 ? 'producto' : 'productos'}.`;
      }

      case 'guardar': {
        for (const l of p.productos) {
          const categoria = adivinarCategoria(l.nombre);
          await createItem({
            householdId: nevera.id,
            name: l.nombre,
            ...cantidadParaGuardar(l.cantidad, l.unidad),
            location: ubicacionSugerida(categoria),
            // Sin fecha: el chat no sabe cuándo caduca. Sale en «Sin fecha» y se puede ponerle una al editarlo.
            limitDate: null,
            dateKind: null,
            dateSource: null,
            category: categoria,
            productId: l.productoId ?? null,
          });
        }
        return `Guardado en ${nevera.name}: ${p.productos.length} ${p.productos.length === 1 ? 'producto' : 'productos'}.`;
      }

      case 'gastar': {
        for (const e of p.elementos) {
          if (e.todo || e.cantidad === null || e.unidad === null) await actions.finish(e.id);
          else await actions.use(e.id, toBase(e.cantidad, unidadDeApp(e.unidad)));
        }
        return `Descontado: ${p.elementos.length} ${p.elementos.length === 1 ? 'elemento' : 'elementos'}.`;
      }

      case 'tirar': {
        for (const e of p.elementos) await actions.discard(e.id, 'chat');
        return `Tirado: ${p.elementos.length} ${p.elementos.length === 1 ? 'elemento' : 'elementos'}.`;
      }

      // Los cuatro tipos están arriba; esto solo existe para que un tipo nuevo sin hacer no pase en silencio.
      default:
        throw new Error('Esa propuesta no se sabe hacer.');
    }
  } finally {
    // Pase lo que pase (también a medias), lo que se ve tiene que ponerse al día. Quien llama varias
    // veces seguidas (el ticket) lo desactiva y lo hace una vez al final.
    if (contexto.invalidar !== false) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(nevera.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.lista }),
        queryClient.invalidateQueries({ queryKey: queryKeys.premium }),
      ]);
    }
  }
}

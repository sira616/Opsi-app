import { QueryClient } from '@tanstack/react-query';

/**
 * Una sola clave por consulta, declarada aquí y no a mano en cada pantalla:
 * invalidar tras una acción es el 90 % de los bugs de datos rancios, y con las
 * claves esparcidas se falla en la que se olvida.
 */
export const queryKeys = {
  priorityList: ['inventory', 'priority'] as const,
  item: (id: string) => ['inventory', 'item', id] as const,
  itemEvents: (id: string) => ['inventory', 'item', id, 'events'] as const,
  household: ['household'] as const,
  settings: ['settings'] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // En un móvil se sale y se vuelve a la app constantemente. Un minuto
      // evita recargar en cada vuelta sin llegar a enseñar datos viejos.
      staleTime: 60_000,
      retry: 1,
    },
  },
});

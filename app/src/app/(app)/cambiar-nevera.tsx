import { SelectorNevera } from '@/features/neveras/SelectorNevera';

/**
 * La hoja para cambiar de nevera, que se abre desde la píldora del inventario.
 * Es una hoja modal declarada en `(app)/_layout.tsx`, con el detent a la medida
 * de la lista; lo que dibuja está en `features/neveras/SelectorNevera.tsx`.
 */
export default function CambiarNevera() {
  return <SelectorNevera />;
}

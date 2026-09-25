import { FormularioNevera } from '@/features/neveras/FormularioNevera';

/**
 * Crear una nevera compartida. Una hoja modal declarada en `(app)/_layout.tsx`.
 * Todo lo que hace está en `features/neveras/FormularioNevera.tsx`, que es el
 * mismo formulario que el de editar.
 */
export default function NuevaNevera() {
  return <FormularioNevera />;
}

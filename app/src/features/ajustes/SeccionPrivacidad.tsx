import { NotaProximamente } from '@/shared/ui/Proximamente';
import { Bloque, Row, Section } from './ui';

/**
 * Qué guardo, qué no sale de aquí y qué puedes hacer con tus datos.
 *
 * ── Exportar tus datos: por qué está sin hacer ────────────────────────────
 *
 * Con lo que hay instalado hoy no se puede hacer bien en las dos mitades donde
 * corre esta app. En el navegador sobra: un Blob y un enlace con `download`. En
 * el móvil no hay dónde escribir el fichero —no está `expo-file-system`— ni con
 * qué entregarlo —tampoco `expo-sharing`—, y lo único disponible sería mandar
 * el JSON entero como texto por `Share`, que muchos destinos recortan sin
 * avisar. Una exportación que se corta por la mitad es peor que ninguna, porque
 * parece que ha funcionado.
 *
 * Hacerlo solo en web tampoco vale: sería un botón que en el móvil no está, y
 * esta pantalla se ve sobre todo en el móvil. Así que se dice que falta, y lo
 * que falta de verdad son dos dependencias, no una decisión.
 *
 * ── Borrar tu cuenta: por qué tampoco ─────────────────────────────────────
 *
 * Borrar un usuario toca `auth.users`, que el cliente no puede escribir ni con
 * la RLS de su parte. Haría falta una función de servidor con permisos
 * elevados, y esa función no existe. No se promete fecha porque no la hay.
 */
export function SeccionPrivacidad() {
  return (
    <Section title="Privacidad y datos">
      <Row
        title="Qué guardo"
        subtitle="Lo que metes en la nevera, tu lista, el historial de lo que ha pasado con cada cosa y tus ajustes. Nada más."
      />

      <Bloque>
        <Row
          title="Qué no sale de este aparato"
          subtitle="El aspecto claro u oscuro se guarda aquí, no en tu cuenta. Por eso cada aparato puede ir a lo suyo."
        />
      </Bloque>

      <Bloque>
        <Row
          title="Exportar tus datos"
          subtitle="Llevarte tu inventario, tu lista y tu historial en un fichero, sin tener que copiarlo a mano."
        />
        <NotaProximamente
          fase="Pendiente"
          que="Todavía no se puede. Falta la pieza que guarda el fichero en el móvil, y una exportación que solo funcione en el navegador no sirve de mucho."
        />
      </Bloque>

      <Bloque>
        <Row
          title="Borrar tu cuenta"
          subtitle="Todavía no se puede desde la app. Falta una pieza del servidor y no te puedo dar fecha."
        />
      </Bloque>
    </Section>
  );
}

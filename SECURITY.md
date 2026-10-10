# Política de seguridad

Opsi es un proyecto en desarrollo, todavía sin publicar ni abierto a usuarios. Aun
así, si encuentras un fallo de seguridad, me interesa saberlo.

## Cómo avisar

**Por favor, no abras un issue público** con los detalles de una vulnerabilidad.

Usa el aviso privado de GitHub: en la pestaña **Security** del repositorio, botón
**Report a vulnerability**. Solo lo ve quien mantiene el proyecto.

## Qué esperar

- Una primera respuesta en unos días. Es un proyecto personal, no hay un equipo de
  guardia.
- Si es real, lo arreglo antes de que sea público y te lo cuento.
- No tengo un programa de recompensas.

## Qué está dentro y qué fuera

**Dentro:** el código de este repositorio y su esquema de base de datos (las
políticas RLS, los permisos y las funciones).

**Fuera:**
- La infraestructura de terceros (Supabase, Expo, GitHub). Avisa directamente a
  quien corresponda.
- Las cuentas de `supabase/seed/`, `syreta` y `compi`: son de **desarrollo local**,
  con contraseña conocida a propósito, y el seed solo las crea en una base que
  tenga el secreto JWT por defecto del Supabase local. No existen en ningún sitio
  desplegado.
- Las claves `EXPO_PUBLIC_*`: llevan la URL y la `anon key` de Supabase, que son
  públicas por diseño y están protegidas por RLS.

Si lo que encuentras es que una de esas tres cosas **sí** da acceso a algo real,
eso sí es un fallo y quiero saberlo.

## Cómo se trabaja la seguridad aquí

Las decisiones y los hallazgos están en `docs/internal/` (la bitácora y la
auditoría), y el modelo de amenazas por funcionalidad en `docs/threat-model.md`.

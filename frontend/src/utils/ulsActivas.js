// ulsActivas.js
// Qué ULs quedan marcadas al abrir la app.
//
// Antes siempre se marcaba la primera de la lista: si estabas trabajando en
// una UL de más abajo, al cerrar y volver a abrir tenías que buscarla y
// marcarla de nuevo cada vez.
//
// Vive aparte del componente para poder testear la parte que falla en
// silencio: restaurar una UL que ya no existe deja el mapa vacío sin decir
// por qué, y es un caso real — una ruta se puede borrar, y a un lector le
// pueden cambiar las ULs asignadas de un mes a otro.

/**
 * @param guardadas    lo que quedó de la sesión anterior
 * @param disponibles  las que el backend devuelve para este usuario hoy
 */
export function ulsARestaurar(guardadas, disponibles) {
  if (!Array.isArray(disponibles) || disponibles.length === 0) return []

  const validas = (Array.isArray(guardadas) ? guardadas : [])
    .filter((ul) => disponibles.includes(ul))

  // Si no sobrevivió ninguna, se marca la primera como siempre: abrir con el
  // mapa vacío se vería como que la app no cargó.
  return validas.length > 0 ? validas : [disponibles[0]]
}

/**
 * Qué queda marcado cuando la lista de ULs se recarga con la app ya abierta
 * (después de importar un KML o de eliminar una ruta).
 *
 * Antes se volvía a aplicar ulsARestaurar sobre lo guardado AL ABRIR la app,
 * así que importar un KML a media sesión te devolvía las ULs de la mañana y
 * perdías las que habías marcado después.
 *
 * Devuelve el MISMO array si no cambió nada: una identidad nueva recargaría
 * todos los medidores de nuevo sin motivo.
 *
 * @param actuales     lo marcado ahora mismo
 * @param disponibles  la lista recién llegada del backend
 */
export function ulsTrasRecargar(actuales, disponibles) {
  // Sin nada marcado es una elección del lector: no se le marca nada.
  if (!Array.isArray(actuales) || actuales.length === 0) return actuales
  const r = ulsARestaurar(actuales, disponibles)
  const iguales = r.length === actuales.length && r.every((ul, i) => ul === actuales[i])
  return iguales ? actuales : r
}

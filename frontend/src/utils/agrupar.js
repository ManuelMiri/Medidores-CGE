// agrupar.js
// Junta en un solo pin los medidores que están prácticamente en el mismo
// punto (mismo poste o misma casa), porque si no quedan uno encima de otro y
// no hay forma de tocar los de abajo.
//
// Vive acá y no en Mapa.jsx para poder testearlo sin montar el mapa: es
// O(n^2) y con 1.765 medidores (todas las ULs activas) se nota, así que
// conviene que esté cubierto antes de optimizarlo.

// Agrupa medidores que están a menos de `metros` entre sí. Para distancias
// tan chicas basta con pasar grados a metros a mano (no hace falta la
// fórmula de haversine). Comparo contra el primer medidor de cada grupo.
//
// Devuelve { lat, lng, position, medidores }. `position` se crea UNA vez por
// grupo y no en cada render a propósito: react-leaflet compara los props por
// identidad, así que un literal `[lat, lng]` nuevo le hace ejecutar
// marker.setLatLng() — una escritura de layout — en los ~300 marcadores cada
// vez que Mapa se re-renderiza, aunque ninguno se haya movido.
export function agruparCercanos(lista, metros) {
  const grupos = []
  for (const m of lista) {
    const c = m.ubicacion?.coordinates
    if (!c) continue
    const [lng, lat] = c
    const grupo = grupos.find(g => {
      const dx = (lng - g.lng) * 111320 * Math.cos(lat * Math.PI / 180)
      const dy = (lat - g.lat) * 110540
      return dx * dx + dy * dy <= metros * metros
    })
    if (grupo) grupo.medidores.push(m)
    else grupos.push({ lat, lng, position: [lat, lng], medidores: [m] })
  }
  return grupos
}

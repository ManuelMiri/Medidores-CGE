// navegacion.js
// El enlace del botón "Ir" del popup: abre Google Maps con la ruta hasta el
// medidor.
//
// Es la URL universal (https) y no un `geo:` ni `google.navigation:`: en el
// APK, Capacitor le pasa a Android todo enlace que sale de la app y Android lo
// abre en la app de Maps; en la PWA desde un PC, la misma URL abre Maps web.
// Un esquema propio de Android dejaría el botón muerto fuera del teléfono.
//
// La coordenada sale de la base (medidor.ubicacion), nunca del log de TOES:
// el enlace se la entrega a Google.

/**
 * URL de navegación hasta el medidor, o null si no tiene ubicación.
 * GeoJSON guarda [lng, lat] y Google espera "lat,lng": invertirlas manda al
 * lector a otro continente sin ningún error, por eso vive acá con su test.
 */
export function urlNavegacion(medidor) {
  const c = medidor?.ubicacion?.coordinates
  if (!Array.isArray(c) || c.length < 2) return null
  const [lng, lat] = c.map(Number)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const destino = `${lat},${lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`
}

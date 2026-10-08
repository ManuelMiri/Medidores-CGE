// vistaMarcador.js
// Decide cómo se ve un punto del mapa según lo que diga TOES. Función pura:
// el render del mapa solo la consulta y aplica el resultado.

import L from 'leaflet'

// Los 5 iconos actuales del mapa son PNG servidos desde raw.githubusercontent
// y unpkg, así que ni sirven para un color arbitrario de la configuración ni
// cargan sin red. Para los colores de clave se arma el pin con un divIcon y
// SVG embebido, el mismo patrón que ya usa MiUbicacion.jsx.
const cache = new Map()

export function iconoColor(hex) {
  if (cache.has(hex)) return cache.get(hex)
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
      <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z"
            fill="${hex}" stroke="#ffffff" stroke-width="1.5"/>
      <circle cx="12.5" cy="12.5" r="4.5" fill="#ffffff" opacity="0.9"/>
    </svg>`
  const icono = L.divIcon({
    html: svg,
    className: 'marcador-toes',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  })
  cache.set(hex, icono)
  return icono
}

/**
 * @param medidor   documento de la colección
 * @param indice    { porInstalacion, porMedidor } del hook
 * @param config    clavesToes.json
 * @param iconos    los L.Icon por estado de mapeo que ya tiene el mapa
 * @param verTomados si está activo, los tomados se atenúan en vez de ocultarse
 */
export function vistaDeMarcador(medidor, indice, config, iconos, verTomados) {
  // Cruce O(1) por instalación. El respaldo por número de medidor solo se
  // usa si el punto no trae instalación, nunca al revés: la instalación es
  // el identificador fuerte.
  const toes =
    indice.porInstalacion.get(medidor.instalacion) ||
    (!medidor.instalacion && medidor.numeroDeSerie
      ? indice.porMedidor.get(medidor.numeroDeSerie)
      : undefined)

  if (!toes) {
    return {
      oculto: false,
      icono: iconos[medidor.estado] || iconos.pendiente,
      opacidad: 1,
      toes: null,
    }
  }

  if (!verTomados) return { oculto: true, toes }

  // Atenuado, y con el color de la clave si hubo una. Una clave que no esté
  // en la configuración no rompe nada: sale como "Clave NN" en color neutro.
  const def = toes.clave ? config.claves[toes.clave] : null
  const color = toes.clave ? (def?.color ?? config.colorClaveDesconocida) : null

  return {
    oculto: false,
    icono: color ? iconoColor(color) : iconos[medidor.estado] || iconos.pendiente,
    opacidad: 0.35,
    toes,
  }
}

/** Texto para el popup: "Tomado 15:42 · con lectura" o "· clave 08" */
export function textoToes(toes, config) {
  if (!toes) return null
  const hora = toes.fecha ? new Date(toes.fecha).toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit',
  }) : ''
  if (toes.clave) {
    const def = config.claves[toes.clave]
    const nombre = def?.nombre ? ` — ${def.nombre}` : ''
    return `Tomado ${hora} · clave ${toes.clave}${nombre}`
  }
  return `Tomado ${hora} · con lectura`
}

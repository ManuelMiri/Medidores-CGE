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
 * Estado que TOES tiene para un punto del mapa, o null si no lo tomó.
 * Cruce O(1) por instalación. El respaldo por número de medidor solo se usa
 * si el punto no trae instalación, nunca al revés: la instalación es el
 * identificador fuerte.
 */
export function estadoToesDe(medidor, indice) {
  return (
    indice.porInstalacion.get(medidor.instalacion) ||
    (!medidor.instalacion && medidor.numeroDeSerie
      ? indice.porMedidor.get(medidor.numeroDeSerie)
      : undefined) ||
    null
  )
}

/** La marca permanente del medidor tal cual está guardada, o null. */
export const marcaDe = (medidor) => medidor.marcaPermanente ?? null

/**
 * La marca solo si todavía dice algo sobre el punto. Una rechazada se guarda
 * para que el sondeo no vuelva a proponer lo mismo, pero el mapa tiene que
 * pintar ese punto como cualquier otro: alguien ya dijo que ahí sí hay medidor.
 */
export const marcaActiva = (medidor) => {
  const m = marcaDe(medidor)
  return m && m.situacion !== 'rechazada' ? m : null
}

/**
 * Decide cómo se ve un pin del mapa. El mapa agrupa los medidores que están a
 * menos de 5 m en un solo pin con contador, así que la decisión es por grupo y
 * no por medidor: lo que se saca son los servicios que el lector ya tomó, y el
 * pin desaparece solo cuando no queda ninguno por visitar.
 *
 * @param grupo         medidores que comparten el punto (todos con ubicación)
 * @param indice        { porInstalacion, porMedidor } del hook
 * @param config        clavesToes.json
 * @param iconos        los L.Icon por estado de mapeo que ya tiene el mapa
 * @param verTomados    si está activo, los tomados se muestran atenuados
 * @param seleccionadoId medidor elegido a propósito (tocado o buscado)
 */
export function vistaDeGrupo(grupo, indice, config, iconos, verTomados, seleccionadoId) {
  const toesPorId = new Map()
  const visibles = []

  for (const m of grupo) {
    const toes = estadoToesDe(m, indice)
    if (toes) toesPorId.set(m._id, toes)
    // Un servicio ya tomado se oculta, salvo que "Ver tomados" esté activo o
    // que el usuario lo haya elegido a propósito. Esa segunda excepción
    // importa: si no estuviera, buscar una instalación que TOES ya tomó no
    // mostraría nada y el buscador pareceria roto.
    // Un punto con marca permanente NO se oculta nunca, aunque TOES lo haya
    // tomado este ciclo. Es justo lo que el lector nuevo tiene que ver al
    // empezar la ruta del mes siguiente: "acá ya no hay medidor, no lo
    // busques". Si se ocultara, la marca no serviría para nada.
    if (marcaActiva(m) || !toes || verTomados || m._id === seleccionadoId) visibles.push(m)
  }

  if (visibles.length === 0) return { oculto: true, visibles, toesPorId }

  // Atenuar solo si TODO lo que queda en el pin ya está tomado. Un grupo
  // mezclado se ve normal, porque todavía hay algo que ir a buscar ahí.
  const todoTomado = visibles.every((m) => toesPorId.has(m._id))

  // La marca manda sobre todo lo demás: es un hecho permanente, mientras que
  // la clave de TOES es de este ciclo.
  const marca = visibles.map(marcaActiva).find(Boolean) ?? null

  // El color se muestra solo cuando hay un único medidor visible: con varios
  // no hay un color que represente al grupo, y además el pin con contador
  // necesita un icono con imagen (iconUrl), que el divIcon de color no tiene.
  let icono = iconos[visibles[0].estado] || iconos.pendiente
  if (visibles.length === 1) {
    const marcaSola = marcaActiva(visibles[0])
    const clave = toesPorId.get(visibles[0]._id)?.clave
    if (marcaSola) {
      icono = iconoColor(config.etiquetas?.[marcaSola.tipo]?.color ?? config.colorClaveDesconocida)
    } else if (clave) {
      // Una clave que no esté en la configuración no rompe nada: sale con el
      // color neutro y el popup la muestra como "clave NN".
      icono = iconoColor(config.claves[clave]?.color ?? config.colorClaveDesconocida)
    }
  }

  // Un punto ya decidido se ve en firme; uno solo propuesto, algo más suave,
  // para que se note que todavía le falta el visto bueno de un supervisor.
  let opacidad = todoTomado ? 0.35 : 1
  if (marca) opacidad = marca.situacion === 'confirmada' ? 1 : 0.75

  return {
    oculto: false,
    visibles,
    toesPorId,
    icono,
    opacidad,
    marca,
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

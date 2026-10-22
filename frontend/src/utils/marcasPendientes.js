// marcasPendientes.js
// El modo revisión del mapa (admin y supervisor): las marcas permanentes que
// esperan que una persona decida, de TODAS las ULs, agrupadas por UL.
//
// Pedido del usuario (2026-10-21): había 11 eriazos propuestos sin confirmar,
// algunos desde el 08-10, repartidos en 6 rutas. Para encontrarlos había que
// marcar cada UL y buscar pin por pin.
//
// Lógica pura, aparte del JSX: qué se lista, en qué orden y qué encuadrar.

import { bboxDe } from './tilesDeRuta.js'

const numerico = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true })

/**
 * [{ ul, items, porTipo }] ordenado por UL; los items, por instalación.
 * Solo las 'propuesta': una que se confirmó o rechazó mientras la lista
 * estaba abierta ya no es pendiente, aunque la respuesta sea de antes.
 */
export function agruparPorUl(medidores, config) {
  const porUl = new Map()
  for (const m of medidores ?? []) {
    const marca = m.marcaPermanente
    if (marca?.situacion !== 'propuesta') continue
    const ul = m.unidadDeLectura || '(sin UL)'
    if (!porUl.has(ul)) porUl.set(ul, [])
    const c = m.ubicacion?.coordinates
    porUl.get(ul).push({
      _id: m._id,
      instalacion: m.instalacion,
      tipo: marca.tipo,
      nombreTipo: config?.etiquetas?.[marca.tipo]?.nombre ?? marca.tipo,
      color: config?.etiquetas?.[marca.tipo]?.color ?? '#718096',
      claveToes: marca.claveToes ?? null,
      cicloOrigen: marca.cicloOrigen ?? null,
      lat: Array.isArray(c) ? c[1] : null,
      lng: Array.isArray(c) ? c[0] : null,
    })
  }

  return [...porUl]
    .sort(([a], [b]) => numerico(a, b))
    .map(([ul, items]) => {
      const porTipo = {}
      for (const x of items) porTipo[x.tipo] = (porTipo[x.tipo] ?? 0) + 1
      return { ul, items: items.sort((a, b) => numerico(a.instalacion, b.instalacion)), porTipo }
    })
}

/** "2 Sitio eriazo · 1 No encontrado", el más numeroso primero. */
export function textoTipos(porTipo, config) {
  return Object.entries(porTipo ?? {})
    .sort(([ta, a], [tb, b]) => b - a || ta.localeCompare(tb))
    .map(([tipo, n]) => `${n} ${config?.etiquetas?.[tipo]?.nombre ?? tipo}`)
    .join(' · ')
}

/**
 * El rectángulo que encuadran los dos motores del mapa, o null si ningún
 * punto tiene ubicación. Un solo punto da un rectángulo sin área: cada motor
 * lo encuadra con su zoom máximo de encuadre.
 */
export function encuadreDe(medidores) {
  const b = bboxDe((medidores ?? []).filter((m) => m.marcaPermanente?.situacion === 'propuesta'))
  if (!b) return null
  return { sur: b.minLat, oeste: b.minLng, norte: b.maxLat, este: b.maxLng }
}

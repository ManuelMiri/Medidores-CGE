// reporteRuta.js
// El resumen de una ruta para mandárselo a la analista: cuántos servicios,
// cuántos leídos, cuántas casas cerradas (por tipo), eriazos, cambios de
// medidor, nuevos y pendientes. Se arma en el teléfono con lo que ya se sabe
// del log y del mapa; no pide nada al servidor y no lleva lecturas.
//
// Las categorías no se pisan: un servicio tomado va a una sola, según su
// clave, así que leídos + cerradas + eriazos + cambios + otras + pendientes
// suman el total. "Nuevos" va aparte porque un nuevo también es un leído.

// "Cambio de medidores" en clavesToes.json. Va acá porque la tabla oficial
// no tiene una categoría para eso, a diferencia de las casas cerradas
// (clavesRepaso) y del sitio eriazo (marcasPorClave).
const CLAVE_CAMBIO = '10'

export function formatearCiclo(ciclo) {
  if (!ciclo) return ''
  const [a, m, d] = ciclo.split('-')
  return `${d}-${m}-${a}`
}

function nombreDeClave(config, clave) {
  return config?.claves?.[clave]?.nombre ?? `Clave ${clave}`
}

// "Casa cerrada - Medidor interior" -> "Medidor interior": dentro del grupo
// de casas cerradas el prefijo sobra.
function sinPrefijoCerrada(nombre) {
  return nombre.replace(/^casa cerrada\s*-\s*/i, '')
}

function detalle(conteo, config, acortar = (n) => n) {
  return [...conteo]
    .map(([clave, n]) => ({ clave, nombre: acortar(nombreDeClave(config, clave)), n }))
    .sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave))
}

/**
 * @param ul         la UL
 * @param datos      toes.porUl[ul]: { ciclo, tomados: Map(instalacion -> evento), cierre }
 * @param medidores  los pines cargados (de todas las ULs marcadas)
 * @param config     clavesToes.json
 */
export function armarReporte({ ul, datos, medidores, config }) {
  const pines = (medidores ?? []).filter((m) => m.unidadDeLectura === ul)
  const pinDe = new Map(pines.map((m) => [m.instalacion, m]))
  const repaso = new Set(config?.clavesRepaso ?? [])
  const eriazo = new Set(
    Object.entries(config?.marcasPorClave ?? {})
      .filter(([, tipo]) => tipo === 'sitioEriazo')
      .map(([clave]) => clave)
  )

  let leidos = 0
  let eriazos = 0
  let cambios = 0
  let nuevos = 0
  let tomadosConPin = 0
  const cerradas = new Map()
  const otras = new Map()
  const sumar = (mapa, clave) => mapa.set(clave, (mapa.get(clave) ?? 0) + 1)

  const tomados = datos?.tomados ?? new Map()
  for (const [instalacion, t] of tomados) {
    const pin = pinDe.get(instalacion)
    if (pin) tomadosConPin++
    // Nuevo: no venía en la ruta. O todavía no tiene pin, o se lo creó la app
    // en este mismo ciclo (useEnviosToes).
    if (!pin || (pin.desdeToes && pin.desdeToes.ciclo === datos.ciclo)) nuevos++

    if (!t.clave) leidos++
    else if (repaso.has(t.clave)) sumar(cerradas, t.clave)
    else if (eriazo.has(t.clave)) eriazos++
    else if (t.clave === CLAVE_CAMBIO) cambios++
    else sumar(otras, t.clave)
  }

  const total = pines.length
  const detalleCerradas = detalle(cerradas, config, sinPrefijoCerrada)
  const detalleOtras = detalle(otras, config)
  return {
    ul,
    ciclo: datos?.ciclo ?? null,
    cierre: datos?.cierre?.tipo ?? null,
    total,
    tomados: tomados.size,
    avance: total ? Math.round((tomados.size / total) * 100) : 0,
    leidos,
    cerradas: { total: detalleCerradas.reduce((s, x) => s + x.n, 0), detalle: detalleCerradas },
    eriazos,
    cambios,
    otras: { total: detalleOtras.reduce((s, x) => s + x.n, 0), detalle: detalleOtras },
    nuevos,
    pendientes: Math.max(0, total - tomadosConPin),
  }
}

// El tipo viene del log tal cual: "Cierre Especial" (cierre parcial, al
// terminar un día de la ruta) o "Cierre Final". Mismo criterio que el panel.
export function textoCierre(cierre) {
  if (cierre === 'final') return 'ruta cerrada'
  if (cierre) return 'cierre parcial'
  return 'en curso'
}

/**
 * El mismo reporte como texto para pegar en WhatsApp: *negrita* con
 * asteriscos, una línea por dato y sin tablas, que en WhatsApp se desarman.
 */
export function textoReporte(r) {
  const lineas = [
    `📋 *Ruta ${r.ul}* · ciclo ${formatearCiclo(r.ciclo)} (${textoCierre(r.cierre)})`,
    '',
    `Servicios: *${r.total}* · tomados ${r.tomados} (${r.avance}%)`,
    `✅ Leídos: *${r.leidos}*`,
    `🔒 Casas cerradas: *${r.cerradas.total}*`,
    ...r.cerradas.detalle.map((x) => `    • ${x.nombre} (${x.clave}): ${x.n}`),
    `🏚️ Sitios eriazos: *${r.eriazos}*`,
    `🔄 Cambios de medidor: *${r.cambios}*`,
  ]
  if (r.otras.total > 0) {
    lineas.push(`⚠️ Otras claves: *${r.otras.total}*`)
    lineas.push(...r.otras.detalle.map((x) => `    • ${x.nombre} (${x.clave}): ${x.n}`))
  }
  lineas.push(`⏳ Pendientes: *${r.pendientes}*`)
  lineas.push(`🆕 Nuevos (no venían en la ruta): *${r.nuevos}*`)
  return lineas.join('\n')
}

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

// En el orden en que se leyeron: así la lista sigue el recorrido de la ruta.
const porFecha = (a, b) => String(a.fecha ?? '').localeCompare(String(b.fecha ?? ''))

function detalle(grupos, config, acortar = (n) => n) {
  return [...grupos]
    .map(([clave, items]) => ({
      clave, nombre: acortar(nombreDeClave(config, clave)), n: items.length, items: items.sort(porFecha),
    }))
    .sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave))
}

/**
 * @param ul             la UL
 * @param datos          toes.porUl[ul]: { ciclo, tomados: Map(instalacion -> evento), cierre }
 * @param medidores      los pines cargados (de todas las ULs marcadas)
 * @param config         clavesToes.json
 * @param cambiosMedidor toes.cambiosMedidor: de ahí sale la serie NUEVA de un
 *                       cambio (la lectura con clave 10 todavía trae la vieja)
 *
 * Además de los números, cada categoría trae su lista ({ instalacion, serie })
 * en `listas`, y cada clave del detalle la suya en `items`: lo que se toca en
 * el reporte para copiarlo. Solo instalación y serie, nada más del log.
 */
export function armarReporte({ ul, datos, medidores, config, cambiosMedidor = [] }) {
  const pines = (medidores ?? []).filter((m) => m.unidadDeLectura === ul)
  const pinDe = new Map(pines.map((m) => [m.instalacion, m]))
  const repaso = new Set(config?.clavesRepaso ?? [])
  const eriazo = new Set(
    Object.entries(config?.marcasPorClave ?? {})
      .filter(([, tipo]) => tipo === 'sitioEriazo')
      .map(([clave]) => clave)
  )

  // El último cambio de cada instalación en este ciclo de esta UL.
  const cambioDe = new Map(
    cambiosMedidor
      .filter((c) => c.unidad === ul && c.ciclo === datos?.ciclo)
      .map((c) => [c.instalacion, c])
  )

  const leidos = []
  const eriazos = []
  const cambios = []
  const nuevos = []
  let tomadosConPin = 0
  const cerradas = new Map()
  const otras = new Map()
  const agregar = (mapa, clave, item) => {
    if (!mapa.has(clave)) mapa.set(clave, [])
    mapa.get(clave).push(item)
  }

  const tomados = datos?.tomados ?? new Map()
  for (const [instalacion, t] of tomados) {
    const pin = pinDe.get(instalacion)
    if (pin) tomadosConPin++
    const item = { instalacion, serie: t.medidor || pin?.numeroDeSerie || null, fecha: t.fecha ?? null }
    // Nuevo: no venía en la ruta. O todavía no tiene pin, o se lo creó la app
    // en este mismo ciclo (useEnviosToes).
    if (!pin || (pin.desdeToes && pin.desdeToes.ciclo === datos.ciclo)) nuevos.push(item)

    if (!t.clave) leidos.push(item)
    else if (repaso.has(t.clave)) agregar(cerradas, t.clave, item)
    else if (eriazo.has(t.clave)) eriazos.push(item)
    else if (t.clave === CLAVE_CAMBIO) cambios.push(conSerieNueva(item, cambioDe.get(instalacion), pin))
    else agregar(otras, t.clave, item)
  }

  const total = pines.length
  const detalleCerradas = detalle(cerradas, config, sinPrefijoCerrada)
  const detalleOtras = detalle(otras, config)
  const pendientes = pines
    .filter((m) => !tomados.has(m.instalacion))
    .map((m) => ({ instalacion: m.instalacion, serie: m.numeroDeSerie || null }))
    // numeric: 9 antes que 10, aunque las instalaciones sean texto.
    .sort((a, b) => a.instalacion.localeCompare(b.instalacion, 'es', { numeric: true }))
  const todas = (det) => det.flatMap((x) => x.items).sort(porFecha)

  return {
    ul,
    ciclo: datos?.ciclo ?? null,
    cierre: datos?.cierre?.tipo ?? null,
    total,
    tomados: tomados.size,
    avance: total ? Math.round((tomados.size / total) * 100) : 0,
    leidos: leidos.length,
    cerradas: { total: detalleCerradas.reduce((s, x) => s + x.n, 0), detalle: detalleCerradas },
    eriazos: eriazos.length,
    cambios: cambios.length,
    otras: { total: detalleOtras.reduce((s, x) => s + x.n, 0), detalle: detalleOtras },
    nuevos: nuevos.length,
    pendientes: Math.max(0, total - tomadosConPin),
    listas: {
      leidos: leidos.sort(porFecha),
      cerradas: todas(detalleCerradas),
      eriazos: eriazos.sort(porFecha),
      cambios: cambios.sort(porFecha),
      otras: todas(detalleOtras),
      pendientes,
      nuevos: nuevos.sort(porFecha),
    },
  }
}

// La lectura con clave 10 trae el medidor VIEJO en GERAET. El nuevo está en
// el bloque /CambioMedidor; si ese no llegó, en la base, cuando la app ya lo
// mandó (useEnviosToes). Si no está en ninguno, queda la vieja, sin "antes".
function conSerieNueva(item, cambio, pin) {
  if (cambio?.serie) {
    return { ...item, serie: cambio.serie, serieAnterior: cambio.serieAnterior || item.serie }
  }
  if (pin?.numeroDeSerie && item.serie && pin.numeroDeSerie !== item.serie) {
    return { ...item, serie: pin.numeroDeSerie, serieAnterior: item.serie }
  }
  return item
}

/**
 * Una lista para copiar y pegar: una línea por servicio, "instalación - serie".
 * Sin encabezado, para que se pueda pegar directo en una planilla.
 */
export function textoLista(items) {
  return items
    .map((x) => {
      const linea = x.serie ? `${x.instalacion} - ${x.serie}` : x.instalacion
      return x.serieAnterior ? `${linea} (antes ${x.serieAnterior})` : linea
    })
    .join('\n')
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

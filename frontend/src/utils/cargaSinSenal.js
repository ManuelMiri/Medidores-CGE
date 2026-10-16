// cargaSinSenal.js
// Qué se muestra cuando la carga de ULs o de medidores no llega.
//
// Caso real (2026-10-16): el lector abrió la app en una zona sin señal y la
// pantalla entera quedó en "Error al cargar las unidades de lectura" — sin
// mapa, sin panel de TOES, sin los cuadros del mapa ya bajados. Ahora cada
// carga deja una copia en el teléfono (utils/copiaRutas.js) y, sin red, se
// trabaja con ella y se avisa de cuándo es.
//
// Vive aparte del componente porque la regla de cuándo sirve la copia falla en
// silencio: mostrar una copia de una UL que el servidor ya no te deja ver, o no
// mostrarla cuando solo faltó la señal, no da ningún error.

/**
 * ¿Sirve la copia del teléfono ante este error?
 *
 * Sin respuesta del servidor es la señal (o un timeout): la copia es lo mejor
 * que hay. Un 5xx, 408 o 429 también: el servidor está, pero no contesta bien.
 * Un 401 lo maneja AuthContext (vuelve al login). Un 403 o 404 es una respuesta
 * de verdad — la UL ya no es tuya o ya no existe — y la copia vieja no sirve.
 */
export function sirveLaCopia(err) {
  const estado = err?.response?.status
  if (!estado) return true
  return estado >= 500 || estado === 408 || estado === 429
}

/**
 * Junta lo que llegó de la red con la copia, UL por UL. Antes era un
 * Promise.all: una sola UL sin respuesta dejaba el mapa vacío para todas.
 *
 * @param ul     la UL
 * @param red    { ok: true, medidores } | { ok: false, err }
 * @param copia  { medidores, fecha } | null
 * @returns { ul, medidores, origen, fecha } con origen:
 *   'red'    llegó bien
 *   'copia'  sin señal, se usa la copia del teléfono
 *   'nada'   sin señal y sin copia
 *   'error'  el servidor contestó que no (403/404...): no es la señal y la copia no sirve
 */
export function resolverCargaUl(ul, red, copia) {
  if (red?.ok) return { ul, medidores: red.medidores ?? [], origen: 'red', fecha: null }
  if (!sirveLaCopia(red?.err)) return { ul, medidores: [], origen: 'error', fecha: null }
  if (copia) return { ul, medidores: copia.medidores ?? [], origen: 'copia', fecha: copia.fecha ?? null }
  return { ul, medidores: [], origen: 'nada', fecha: null }
}

/** Une los medidores de varias ULs sin repetir (un medidor puede venir dos veces). */
export function unirMedidores(listas) {
  const porId = new Map()
  for (const lista of listas) for (const m of lista ?? []) porId.set(m._id, m)
  return [...porId.values()]
}

/**
 * Resume las cargas para el aviso. null si todo llegó de la red.
 * `fecha` es la de la copia MÁS VIEJA: es la que importa para saber cuánto
 * puede estar atrasado lo que se ve.
 */
export function resumenSinSenal(resultados) {
  const desdeCopia = resultados.filter((r) => r.origen === 'copia')
  const sinDatos = resultados.filter((r) => r.origen === 'nada')
  if (desdeCopia.length === 0 && sinDatos.length === 0) return null
  const fechas = desdeCopia.map((r) => r.fecha).filter(Boolean).sort()
  return {
    desdeCopia: desdeCopia.map((r) => r.ul),
    sinDatos: sinDatos.map((r) => r.ul),
    fecha: fechas[0] ?? null,
  }
}

const dos = (n) => String(n).padStart(2, '0')

/** "16-10 09:35", en la hora del teléfono. */
export function fechaCorta(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/**
 * El texto del aviso, o null si no hay nada que avisar.
 * @param resumen      lo de resumenSinSenal (medidores), o null
 * @param fechaUls     fecha de la copia de la LISTA de ULs si vino de ahí, o null
 * @param listaSinRed  true si la lista de ULs no llegó y tampoco había copia
 */
export function textoSinSenal(resumen, fechaUls = null, listaSinRed = false) {
  const partes = []
  if (listaSinRed) {
    partes.push('Sin señal, y este teléfono todavía no tiene una copia de tus rutas: ábrela una vez con señal para que quede guardada.')
  }
  if (resumen?.desdeCopia.length) {
    const cuando = fechaCorta(resumen.fecha)
    const cuales = resumen.desdeCopia.length === 1 ? `la UL ${resumen.desdeCopia[0]}` : `${resumen.desdeCopia.length} ULs`
    partes.push(`Sin señal: ${cuales} se muestra${resumen.desdeCopia.length === 1 ? '' : 'n'} con la copia guardada${cuando ? ` del ${cuando}` : ''}.`)
  } else if (fechaUls && !resumen?.sinDatos.length) {
    const cuando = fechaCorta(fechaUls)
    partes.push(`Sin señal: la lista de ULs es la copia guardada${cuando ? ` del ${cuando}` : ''}.`)
  }
  if (resumen?.sinDatos.length) {
    const cuales = resumen.sinDatos.join(', ')
    partes.push(`Sin señal y sin copia de ${cuales}: no se puede mostrar hasta que vuelva la señal.`)
  }
  if (partes.length === 0) return null
  return partes.join(' ') + ' Se actualiza sola al volver la señal.'
}

// altasToes.js
// Qué servicios tomados en TOES no tienen pin en el mapa, para crearlos con el
// GPS que TOES guardó al grabar la lectura.
//
// Es la parte que puede salir mal en silencio y en grande: si se calcula con
// los medidores a medio cargar, TODOS los servicios de la UL parecen sin pin.
// El servidor no duplica una instalación que ya existe, pero serían cientos de
// peticiones. Por eso los resguardos de abajo, y por eso vive aparte, con tests.

// Si a una UL le faltan más que esto, no se crea nada: es más probable que la
// lista de medidores esté incompleta que que falten tantos pines de verdad.
// En los logs reales faltaban 7 de 1.068, con un máximo de 4 en una UL de 51.
const MAXIMO_FIJO = 10
const MAXIMO_PROPORCION = 0.2

// Solo lecturas recientes: el pin se crea "al guardar en TOES", no por
// cualquier lectura vieja que siga en el log. Si no, un pin que un admin
// eliminó a propósito volvería a aparecer cada vez que se abre la app,
// porque el log de ese día sigue en el teléfono. Tres días cubren el mismo
// día, una noche sin señal y un teléfono que quedó apagado.
export const VENTANA_MS = 3 * 24 * 60 * 60 * 1000

/**
 * @param medidores   los cargados en el mapa
 * @param porUl       toes.porUl: { [ul]: { ciclo, descartado, tomados: Map(instalacion -> evento) } }
 * @param ulsActivas  las ULs marcadas
 * @param ahora       para los tests; en la app, el reloj
 * @returns { altas: [...], bloqueadas: [ul, ...] }
 */
export function altasPendientes(medidores, porUl, ulsActivas, ahora = Date.now()) {
  const altas = []
  const bloqueadas = []
  if (!medidores?.length || !porUl) return { altas, bloqueadas }

  const porInstalacion = new Map(medidores.map((m) => [m.instalacion, m]))
  // El mapa también reconoce un servicio por la serie del medidor (respaldo
  // de vistaMarcador): si la serie ya está en algún pin, no falta.
  const series = new Set()
  for (const m of medidores) {
    if (m.numeroDeSerie) series.add(m.numeroDeSerie)
    if (m.medidorLupa?.numeroDeSerie) series.add(m.medidorLupa.numeroDeSerie)
  }

  for (const ul of ulsActivas ?? []) {
    const d = porUl[ul]
    if (!d || d.descartado || !d.tomados?.size) continue
    // Sin ningún medidor de esta UL cargado todavía (se acaba de marcar y la
    // carga va en camino): no hay con qué comparar.
    if (!medidores.some((m) => m.unidadDeLectura === ul)) continue

    const deLaUl = []
    for (const [instalacion, ev] of d.tomados) {
      if (!ev.gps) continue
      const leido = Date.parse(ev.fecha ?? '')
      if (!(leido >= ahora - VENTANA_MS)) continue
      const alta = {
        instalacion,
        ul,
        ciclo: ev.ciclo ?? d.ciclo ?? null,
        lat: ev.gps.lat,
        lng: ev.gps.lng,
        serie: ev.medidor || null,
        marca: ev.marca || null,
        direccion: ev.direccion || null,
        poste: ev.poste || null,
        fecha: ev.fecha || null,
      }

      const existente = porInstalacion.get(instalacion)
      if (existente) {
        // Un pin que creó la app antes de que el log diera dirección y poste
        // (pasó con el primero, el 103694009): se completa lo que le falta.
        // Solo los creados desde TOES; un pin de MLA no se toca.
        const falta = (!existente.direccion && alta.direccion) || (!existente.numeroDePoste && alta.poste)
        if (existente.desdeToes && falta) altas.push({ ...alta, completar: true })
        continue
      }
      if (ev.medidor && series.has(ev.medidor)) continue
      deLaUl.push(alta)
    }

    // El tope cuenta solo los pines nuevos: completar uno existente no es
    // señal de una lista a medio cargar.
    const tope = Math.max(MAXIMO_FIJO, Math.floor(d.tomados.size * MAXIMO_PROPORCION))
    if (deLaUl.length > tope) bloqueadas.push(ul)
    else altas.push(...deLaUl)
  }
  return { altas, bloqueadas }
}

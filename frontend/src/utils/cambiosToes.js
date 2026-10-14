// cambiosToes.js
// Qué cambios de medidor registrados en TOES todavía no llegaron a la base.
//
// Vive aparte del hook para poder testearlo: si la comparación fallara en
// silencio, la app mandaría el mismo cambio en cada vuelta del sondeo, o al
// revés, el próximo lector buscaría en terreno un medidor que ya no existe.

/**
 * @param medidores  los cargados en el mapa (con numeroDeSerie, medidorLupa, cambioMedidor)
 * @param cambios    los acumulados por useToes: { instalacion, serie, marca, serieAnterior, ciclo, fecha }
 * @returns acciones para POST /medidores/:instalacion/cambio-medidor
 */
export function accionesDeCambio(medidores, cambios) {
  if (!medidores?.length || !cambios?.length) return []

  // Si una instalación tuvo dos cambios, vale el último.
  const ultimo = new Map()
  for (const c of cambios) {
    const previo = ultimo.get(c.instalacion)
    if (!previo || (c.fecha ?? '') >= (previo.fecha ?? '')) ultimo.set(c.instalacion, c)
  }

  const porInstalacion = new Map(medidores.map((m) => [m.instalacion, m]))
  const acciones = []
  for (const c of ultimo.values()) {
    const m = porInstalacion.get(c.instalacion)
    if (!m) continue // no está cargado (otra UL o no existe): nada que comparar
    const yaEsta = m.numeroDeSerie === c.serie ||
      m.medidorLupa?.numeroDeSerie === c.serie ||
      m.cambioMedidor?.serieNueva === c.serie
    if (yaEsta) continue
    acciones.push({
      instalacion: c.instalacion,
      serie: c.serie,
      marca: c.marca ?? null,
      serieAnterior: c.serieAnterior ?? null,
      ciclo: c.ciclo ?? null,
      fecha: c.fecha ?? null,
    })
  }
  return acciones
}

export const claveDeCambio = (a) => `${a.instalacion}|${a.serie}`

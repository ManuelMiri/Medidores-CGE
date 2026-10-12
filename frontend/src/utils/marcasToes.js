// marcasToes.js
// Decide qué marcas permanentes proponer o quitar según lo que diga TOES.
//
// Función pura y aparte del hook para poder testearla sin red ni teléfono:
// es la que decide escribir en el servidor, así que equivocarse acá no se ve
// en pantalla pero deja un medidor real descartado para los próximos meses
// (o al revés, hace perder el tiempo que esto venía a ahorrar).

import { estadoToesDe, marcaDe } from './vistaMarcador.js'

/**
 * Qué hacer con cada medidor según su registro de TOES del ciclo vigente.
 *
 * Devuelve una lista de { instalacion, accion, ... } donde accion es
 * 'proponer' o 'quitar'. No ejecuta nada: eso es trabajo de useMarcasToes.
 *
 * @param medidores  los cargados en el mapa
 * @param indice     { porInstalacion, porMedidor } del hook de TOES
 * @param config     clavesToes.json (usa `marcasPorClave`)
 */
export function accionesDeMarca(medidores, indice, config) {
  const porClave = config?.marcasPorClave ?? {}
  const acciones = []

  for (const m of medidores) {
    if (!m.instalacion) continue
    const toes = estadoToesDe(m, indice)
    if (!toes) continue
    const marca = marcaDe(m)

    // Una lectura real prueba que el medidor SÍ está, así que la marca se
    // cae sola. Es el lado seguro del error: como mucho alguien vuelve a
    // buscar un medidor. Lo caro es lo contrario, dejar uno real descartado.
    if (marca && toes.conLectura) {
      acciones.push({ instalacion: m.instalacion, accion: 'quitar' })
      continue
    }

    // Solo las claves que significan "el medidor no está en terreno". Las de
    // "no se pudo leer esta vez" (casa cerrada, sin acceso) no entran: el
    // medidor sigue ahí y el mes que viene puede leerse.
    const tipo = toes.clave ? porClave[toes.clave] : null
    if (!tipo) continue

    // Ya está marcado con lo mismo, o una persona ya decidió (confirmada o
    // rechazada): no se toca. Una propuesta automática nunca puede pisar una
    // decisión humana — y sin esto, rechazar una marca no serviría de nada:
    // el sondeo la volvería a proponer a los 5 segundos.
    const yaDecidida = marca && marca.situacion !== 'propuesta'
    if (marca && (marca.tipo === tipo || yaDecidida)) continue

    acciones.push({
      instalacion: m.instalacion,
      accion: 'proponer',
      tipo,
      claveToes: toes.clave,
      cicloOrigen: toes.ciclo ?? null,
    })
  }

  return acciones
}

/** Clave estable de una acción, para no repetirla mientras está en vuelo. */
export const claveDeAccion = (a) =>
  `${a.instalacion}|${a.accion}|${a.tipo ?? ''}|${a.cicloOrigen ?? ''}`

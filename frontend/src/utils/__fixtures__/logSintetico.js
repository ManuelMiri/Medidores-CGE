// Genera logs con la misma estructura que escribe TOES, pero con datos
// inventados. Los logs reales traen direcciones, lecturas y coordenadas de
// clientes, asi que no entran al repo: los tests corren contra esto.
//
// Para contrastar contra un log real sin versionarlo:
//   TOES_LOG_REAL=/ruta/al/Log_TOES-*.txt npm test

const PREFIJO = '2026-10-06 14:53:49.569 : DEBUG : '

// Un bloque "Backup de la lectura": lo que el parser debe procesar.
export function bloqueServicio({
  unidad = 'E9999999',
  instalacion = 'Z1',
  ciclo = '2026-10-06',
  medidor = 'MED-1',
  orden = '00000030000008401784',
  lectura = '59110',
  clave = '',
  fecha = '2026-10-06T17:53:49.520Z',
  registro = 1,
  // sirve para probar que el conteo de llaves respeta strings
  calle = 'CALLEJONES',
} = {}) {
  const json = {
    uid: 'id-sintetico-' + orden,
    sPath: `/GuardarOrdenes('${orden}')`,
    oData: {
      __metadata: { uri: 'https://ejemplo/OrdenesLectura', type: 'cge.services.toes4.OrdenesLecturaType' },
      ABLEINH: unidad,
      ANLAGE: instalacion,
      STREET: calle,
      ZWNUMMER: registro,
      ABLBELNR: orden,
      ADATSOLL: ciclo + 'T00:00:00.000Z',
      READINGRESULT: lectura,
      METERREADINGNOTE: clave,
      ACTUALMRDATE: fecha,
      GERAET: medidor,
    },
    mParameters: {},
    method: 'update',
  }
  const hora = fecha.slice(11, 23)
  return `2026-10-06 ${hora} : DEBUG : Backup de la lectura (${orden}): ${JSON.stringify(json, null, 2)}\n`
}

// Un bloque de sincronizacion: MISMOS campos, pero oData es un array y la
// linea no lleva el marcador. El parser debe ignorarlo por completo; si lo
// contara, las claves saldrian duplicadas.
export function bloqueSincronizacion(servicios = [{}]) {
  const json = {
    uid: 'id-sync',
    sPath: 'GroupOrdenes',
    oData: servicios.map((s) => ({
      ABLEINH: s.unidad ?? 'E9999999',
      ANLAGE: s.instalacion ?? 'Z1',
      ADATSOLL: (s.ciclo ?? '2026-10-06') + 'T00:00:00.000Z',
      READINGRESULT: s.lectura ?? '59110',
      METERREADINGNOTE: s.clave ?? '',
      ACTUALMRDATE: s.fecha ?? '2026-10-06T17:53:49.520Z',
      GERAET: s.medidor ?? 'MED-1',
    })),
    mParameters: { saveGroup: true },
    entityName: 'GroupOrdenes',
  }
  return `${PREFIJO}-- Sincronizado correctamente --\n${PREFIJO}${JSON.stringify(json, null, 2)}\n${PREFIJO}--------------------------------\n`
}

// Las dos variantes de cierre que escribe TOES. El README solo documentaba
// "Especial"; "Final" aparecio en el log del segundo dia de una ruta.
// Ojo: la hora de esta linea es LOCAL, mientras que el ACTUALMRDATE de los
// bloques viene en UTC. En los logs reales se llevan 3 horas de diferencia.
export function lineaCierre(unidad = 'E9999999', tipo = 'Especial', hora = '19:23:25.266', dia = '2026-10-06') {
  return `${dia} ${hora} : DEBUG : Cierre ${tipo} realizado correctamente: ["'${unidad}'"]\n`
}

export function lineaRuido() {
  return `${PREFIJO}-- Tomando foto --\n${PREFIJO}------ RAM total: 5382------\n`
}

export function cabecera() {
  return `${PREFIJO}-- Iniciando aplicación --\n`
}

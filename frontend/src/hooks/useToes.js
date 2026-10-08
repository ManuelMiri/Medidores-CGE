// useToes.js
// Une el parser, el almacén local y el mapa. Todo ocurre en el teléfono.
//
// La fuente del texto del log es lo único que cambia entre entornos:
//   - navegador: el usuario elige el archivo con <input type="file">
//   - APK:       el plugin nativo lee la carpeta /TOES (pendiente)
// El resto del flujo es idéntico, por eso vive acá y no duplicado.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  parsearLog,
  estadoPorInstalacion,
  cicloVigente,
  estadoDeUL,
  tomadosPorMedidor,
  cierreDeCiclo,
} from '../utils/toesParser'
import * as almacen from '../utils/toesStore'
import config from '../config/clavesToes.json'

const CLAVE_VER_TOMADOS = 'toesVerTomados'

export function useToes(ulsActivas = []) {
  const [listo, setListo] = useState(false)
  const [estado, setEstado] = useState(() => new Map())
  const [cierres, setCierres] = useState([])
  const [archivos, setArchivos] = useState({})
  const [descartados, setDescartados] = useState({})
  const [invalidos, setInvalidos] = useState(0)
  const [ultimaRevision, setUltimaRevision] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [verTomados, setVerTomadosState] = useState(
    () => localStorage.getItem(CLAVE_VER_TOMADOS) === 'si'
  )

  // Carga inicial desde IndexedDB
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [e, c, a, d] = await Promise.all([
        almacen.cargarEstado(),
        almacen.cargarCierres(),
        almacen.cargarArchivos(),
        almacen.cargarCiclosDescartados(),
      ])
      if (!vivo) return
      setEstado(e)
      setCierres(c)
      setArchivos(a)
      setDescartados(d)
      setListo(true)
    })()
    return () => { vivo = false }
  }, [])

  const setVerTomados = useCallback((valor) => {
    setVerTomadosState(valor)
    localStorage.setItem(CLAVE_VER_TOMADOS, valor ? 'si' : 'no')
  }, [])

  /**
   * Procesa el texto de un log. `desde` permite leer solo lo nuevo; el
   * llamador suma el `consumido` que devuelve para la próxima vuelta.
   * Reprocesar un archivo completo es inofensivo: el estado se deduplica
   * por UL + ciclo + instalación, así que perder el cursor nunca es un
   * problema de correctitud, solo de rendimiento.
   */
  const procesarTexto = useCallback(async (nombre, texto, desde = 0) => {
    const trozo = desde > 0 ? texto.slice(desde) : texto
    const r = parsearLog(trozo)

    const nuevoEstado = estadoPorInstalacion(r.eventos, estado)
    // los cierres pueden repetirse entre lecturas: se deduplican por
    // UL + tipo + fecha, así marcar una UL cerrada es idempotente.
    const vistos = new Set(cierres.map((c) => `${c.unidad}|${c.tipo}|${c.fechaLog}`))
    const nuevosCierres = [
      ...cierres,
      ...r.cierres.filter((c) => !vistos.has(`${c.unidad}|${c.tipo}|${c.fechaLog}`)),
    ]
    const nuevosArchivos = {
      ...archivos,
      [nombre]: {
        tamano: texto.length,
        cursor: desde + r.consumido,
        unidadOffset: 'chars',
        completo: desde + r.consumido >= texto.length,
      },
    }

    setEstado(nuevoEstado)
    setCierres(nuevosCierres)
    setArchivos(nuevosArchivos)
    setInvalidos((n) => n + r.invalidos)
    setUltimaRevision(new Date())

    await Promise.all([
      almacen.guardarEstado(nuevoEstado),
      almacen.guardarCierres(nuevosCierres),
      almacen.guardarArchivos(nuevosArchivos),
    ])
    return { eventos: r.eventos.length, invalidos: r.invalidos }
  }, [estado, cierres, archivos])

  /** Carga manual: el usuario elige uno o varios Log_TOES-*.txt */
  const procesarArchivos = useCallback(async (lista) => {
    setProcesando(true)
    try {
      // en orden cronológico: el nombre Log_TOES-AAAA-MM-DD_HHMMSS ordena
      // igual que el tiempo, y el orden importa porque un cierre se asocia
      // al ciclo vigente del momento en que se aplica.
      const ordenados = [...lista].sort((a, b) => a.name.localeCompare(b.name))
      let total = 0
      for (const archivo of ordenados) {
        const texto = await archivo.text()
        const previo = archivos[archivo.name]
        // si el archivo creció, seguir desde donde quedó; si cambió de
        // tamaño hacia abajo o cambió la unidad del offset, reprocesar entero
        const desde =
          previo && previo.unidadOffset === 'chars' && texto.length >= previo.tamano
            ? previo.cursor
            : 0
        const r = await procesarTexto(archivo.name, texto, desde)
        total += r.eventos
      }
      return total
    } finally {
      setProcesando(false)
    }
  }, [archivos, procesarTexto])

  /** Respaldo manual: descarta el ciclo vigente de una UL (no borra nada) */
  const nuevoCiclo = useCallback(async (ul) => {
    const ciclo = cicloVigente(estado, ul)
    if (!ciclo) return
    const mapa = { ...descartados, [ul]: ciclo }
    setDescartados(mapa)
    await almacen.guardarCiclosDescartados(mapa)
  }, [estado, descartados])

  const reiniciar = useCallback(async () => {
    await almacen.borrarTodo()
    setEstado(new Map())
    setCierres([])
    setArchivos({})
    setDescartados({})
    setInvalidos(0)
  }, [])

  // Resumen por UL activa
  const porUl = useMemo(() => {
    const salida = {}
    for (const ul of ulsActivas) {
      const ciclo = cicloVigente(estado, ul)
      const descartado = descartados[ul] === ciclo
      const tomados = descartado ? new Map() : estadoDeUL(estado, ul, ciclo)
      const porMedidor = descartado ? new Map() : tomadosPorMedidor(estado, ul, ciclo)
      // El cierre tiene que ser DE ESTE ciclo. Tomar simplemente el último de
      // la UL hacía que el cierre del mes pasado marcara como CERRADA una
      // ruta que recién empieza.
      const cierre = descartado ? null : cierreDeCiclo(cierres, estado, ul, ciclo)
      salida[ul] = { ciclo, descartado, tomados, porMedidor, cierre }
    }
    return salida
  }, [estado, cierres, descartados, ulsActivas])

  /**
   * Índice plano para el mapa. Se consulta por instalación y, como respaldo,
   * por número de medidor. Cada entrada sabe de qué UL viene, así un registro
   * de una UL nunca puede ocultar el punto de otra.
   */
  const indice = useMemo(() => {
    const porInstalacion = new Map()
    const porMedidor = new Map()
    for (const ul of ulsActivas) {
      const d = porUl[ul]
      if (!d) continue
      for (const [inst, v] of d.tomados) porInstalacion.set(inst, v)
      for (const [med, v] of d.porMedidor) porMedidor.set(med, v)
    }
    return { porInstalacion, porMedidor }
  }, [porUl, ulsActivas])

  return {
    listo,
    config,
    estado,
    cierres,
    archivos,
    invalidos,
    ultimaRevision,
    procesando,
    verTomados,
    setVerTomados,
    procesarArchivos,
    procesarTexto,
    nuevoCiclo,
    reiniciar,
    porUl,
    indice,
  }
}

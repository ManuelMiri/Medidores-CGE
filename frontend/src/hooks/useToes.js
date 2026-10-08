// useToes.js
// Une el parser, el almacén local y el mapa. Todo ocurre en el teléfono.
//
// La fuente del texto del log es lo único que cambia entre entornos:
//   - navegador: el usuario elige el archivo con <input type="file">
//   - APK:       el plugin nativo lee la carpeta /TOES por SAF y se relee
//                sola cada 5 s (ver utils/toesNativo.js)
// El resto del flujo es idéntico, por eso vive acá y no duplicado.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { App } from '@capacitor/app'
import {
  parsearLog,
  estadoPorInstalacion,
  cicloVigente,
  estadoDeUL,
  tomadosPorMedidor,
  cierreDeCiclo,
} from '../utils/toesParser'
import { avanceDeCursor, cursorInicial } from '../utils/cursorToes'
import {
  carpetaConcedida,
  esSinPermiso,
  hayPluginNativo,
  leerNovedades,
  olvidarCarpeta,
  pedirCarpeta,
} from '../utils/toesNativo'
import * as almacen from '../utils/toesStore'
import config from '../config/clavesToes.json'

const CLAVE_VER_TOMADOS = 'toesVerTomados'

/** Cada cuánto se relee /TOES en el APK. El criterio de aceptación pide que un
 *  punto desaparezca del mapa en 5-10 s desde que se guarda en TOES. */
const CADA_MS = 5000

export function useToes(ulsActivas = []) {
  const [listo, setListo] = useState(false)
  const [estado, setEstado] = useState(() => new Map())
  const [cierres, setCierres] = useState([])
  const [archivos, setArchivos] = useState({})
  const [descartados, setDescartados] = useState({})
  const [invalidos, setInvalidos] = useState(0)
  const [ultimaRevision, setUltimaRevision] = useState(null)
  const [procesando, setProcesando] = useState(false)
  const [carpeta, setCarpeta] = useState(null)
  const [errorNativo, setErrorNativo] = useState(null)
  const [verTomados, setVerTomadosState] = useState(
    () => localStorage.getItem(CLAVE_VER_TOMADOS) === 'si'
  )

  const nativo = hayPluginNativo()

  /**
   * Fuente de verdad de lo acumulado, en paralelo al estado de React.
   *
   * Hace falta porque una sola pasada procesa varios trozos seguidos (un
   * archivo que creció se lee en tandas, y /TOES tiene varios logs). El estado
   * de React no se actualiza en medio de un callback, así que leyéndolo del
   * closure la segunda tanda partiría del estado anterior a la primera y
   * borraría sus eventos — y además los persistiría así en IndexedDB.
   */
  const datos = useRef({ estado: new Map(), cierres: [], archivos: {} })

  // Carga inicial desde IndexedDB + la carpeta que Android siga concediendo
  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [e, c, a, d, carpetaGuardada] = await Promise.all([
        almacen.cargarEstado(),
        almacen.cargarCierres(),
        almacen.cargarArchivos(),
        almacen.cargarCiclosDescartados(),
        almacen.cargarCarpeta(),
      ])
      if (!vivo) return
      datos.current = { estado: e, cierres: c, archivos: a }
      setEstado(e)
      setCierres(c)
      setArchivos(a)
      setDescartados(d)
      setListo(true)

      // Le preguntamos al plugin y no a IndexedDB: el permiso se puede haber
      // revocado desde los ajustes de Android, y al revés, si se limpiaron los
      // datos del WebView el URI guardado se perdió pero el permiso sigue vivo.
      const concedida = await carpetaConcedida(carpetaGuardada)
      if (!vivo) return
      if (concedida && concedida !== carpetaGuardada) await almacen.guardarCarpeta(concedida)
      setCarpeta(concedida)
    })()
    return () => { vivo = false }
  }, [])

  const setVerTomados = useCallback((valor) => {
    setVerTomadosState(valor)
    localStorage.setItem(CLAVE_VER_TOMADOS, valor ? 'si' : 'no')
  }, [])

  /**
   * Procesa un trozo de log y persiste el progreso.
   *
   * `meta` es { desde, bytesLeidos, tamano, hayMas }, todo en BYTES: el parser
   * cuenta caracteres pero el archivo se mide en bytes y no coinciden (los
   * acentos ocupan dos), así que la conversión la hace `avanceDeCursor`.
   *
   * Devuelve { eventos, invalidos, avance }; `avance` es cuánto se movió el
   * cursor, y el lector de /TOES lo usa para saber si seguir leyendo.
   *
   * Reprocesar un trozo es inofensivo: el estado se deduplica por UL + ciclo +
   * instalación y los cierres por UL + tipo + fecha, así que perder el cursor
   * nunca es un problema de correctitud, solo de rendimiento.
   */
  const procesarTrozo = useCallback(async (nombre, texto, meta = {}) => {
    const { desde = 0, bytesLeidos = 0, hayMas = false } = meta
    const tamano = meta.tamano ?? desde + bytesLeidos

    const r = parsearLog(texto)
    const avance = avanceDeCursor(texto, r.consumido, bytesLeidos, hayMas)

    const previo = datos.current
    const nuevoEstado = estadoPorInstalacion(r.eventos, previo.estado)
    // los cierres pueden repetirse entre lecturas: se deduplican por
    // UL + tipo + fecha, así marcar una UL cerrada es idempotente.
    const vistos = new Set(previo.cierres.map((c) => `${c.unidad}|${c.tipo}|${c.fechaLog}`))
    const nuevosCierres = [
      ...previo.cierres,
      ...r.cierres.filter((c) => !vistos.has(`${c.unidad}|${c.tipo}|${c.fechaLog}`)),
    ]
    const cursor = desde + avance
    const nuevosArchivos = {
      ...previo.archivos,
      [nombre]: {
        tamano,
        cursor,
        unidadOffset: 'bytes',
        completo: cursor >= tamano,
      },
    }

    datos.current = { estado: nuevoEstado, cierres: nuevosCierres, archivos: nuevosArchivos }
    setEstado(nuevoEstado)
    setCierres(nuevosCierres)
    setArchivos(nuevosArchivos)
    if (r.invalidos) setInvalidos((n) => n + r.invalidos)

    await Promise.all([
      almacen.guardarEstado(nuevoEstado),
      almacen.guardarCierres(nuevosCierres),
      almacen.guardarArchivos(nuevosArchivos),
    ])
    return { eventos: r.eventos.length, invalidos: r.invalidos, avance }
  }, [])

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
        // Se corta el Blob y no el texto: File.size y el cursor van en bytes,
        // y cortar la cadena ya decodificada mezclaría caracteres con bytes.
        // El cursor siempre cae en un byte ASCII (el `}` que cierra un bloque
        // o un salto de línea), así que el corte nunca parte un carácter.
        const desde = cursorInicial(datos.current.archivos[archivo.name], archivo.size)
        const texto = await (desde > 0 ? archivo.slice(desde) : archivo).text()
        const r = await procesarTrozo(archivo.name, texto, {
          desde,
          bytesLeidos: archivo.size - desde,
          tamano: archivo.size,
          hayMas: false,
        })
        total += r.eventos
      }
      setUltimaRevision(new Date())
      return total
    } finally {
      setProcesando(false)
    }
  }, [procesarTrozo])

  // ------------------------------------------------------------ carpeta /TOES

  const elegirCarpeta = useCallback(async () => {
    try {
      const uri = await pedirCarpeta()
      if (!uri) return null // canceló el selector
      await almacen.guardarCarpeta(uri)
      setErrorNativo(null)
      setCarpeta(uri)
      return uri
    } catch (err) {
      setErrorNativo(err?.message ?? 'Android no dejó abrir el selector de carpetas')
      return null
    }
  }, [])

  const cambiarCarpeta = useCallback(async () => {
    const anterior = carpeta
    setCarpeta(null)
    await olvidarCarpeta(anterior)
    await almacen.guardarCarpeta(null)
    return elegirCarpeta()
  }, [carpeta, elegirCarpeta])

  /**
   * Una pasada de lectura de /TOES. Silenciosa a propósito: no toca
   * `procesando`, porque si no el panel parpadearía "Leyendo…" cada 5 s.
   */
  const enVuelo = useRef(false)
  const revisar = useCallback(async () => {
    if (!carpeta || enVuelo.current) return 0
    enVuelo.current = true
    try {
      const r = await leerNovedades(carpeta, datos.current.archivos, procesarTrozo)
      setUltimaRevision(new Date())
      setErrorNativo(null)
      return r.eventos
    } catch (err) {
      if (esSinPermiso(err)) {
        // El lector revocó el permiso, o la carpeta ya no está. Se vuelve al
        // estado "sin conectar" para que el panel ofrezca elegirla de nuevo.
        setCarpeta(null)
        await almacen.guardarCarpeta(null)
        setErrorNativo('Se perdió el acceso a la carpeta TOES. Hay que elegirla de nuevo.')
      } else {
        setErrorNativo(err?.message ?? 'No se pudo leer la carpeta TOES')
      }
      return 0
    } finally {
      enVuelo.current = false
    }
  }, [carpeta, procesarTrozo])

  // El intervalo se queda con una referencia siempre fresca en vez de depender
  // de `revisar`: así no se reinicia en cada render ni se salta una vuelta.
  const revisarRef = useRef(revisar)
  useEffect(() => { revisarRef.current = revisar }, [revisar])

  const vigilando = Boolean(nativo && carpeta && listo)

  useEffect(() => {
    if (!vigilando) return
    const tic = () => { revisarRef.current?.() }
    tic() // apenas se conecta la carpeta, sin esperar los 5 s
    const id = setInterval(tic, CADA_MS)
    return () => clearInterval(id)
  }, [vigilando])

  // Volver a la app es el momento que importa de verdad. Mientras el lector
  // está en TOES nuestro WebView queda en segundo plano y Android congela los
  // timers, así que el intervalo no corre: al volver al mapa esta lectura
  // inmediata es la que hace desaparecer el punto recién tomado.
  useEffect(() => {
    if (!vigilando) return
    let suscripcion
    let vivo = true
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) revisarRef.current?.()
    }).then((h) => {
      if (vivo) suscripcion = h
      else h.remove()
    })
    return () => {
      vivo = false
      suscripcion?.remove()
    }
  }, [vigilando])

  // ------------------------------------------------------------------ resumen

  /** Respaldo manual: descarta el ciclo vigente de una UL (no borra nada) */
  const nuevoCiclo = useCallback(async (ul) => {
    const ciclo = cicloVigente(datos.current.estado, ul)
    if (!ciclo) return
    const mapa = { ...descartados, [ul]: ciclo }
    setDescartados(mapa)
    await almacen.guardarCiclosDescartados(mapa)
  }, [descartados])

  const reiniciar = useCallback(async () => {
    await almacen.borrarTodo()
    // borrarTodo limpia el almacén completo, carpeta incluida, pero el permiso
    // de Android sigue concedido: se vuelve a guardar para no mandar al lector
    // a elegir la misma carpeta de nuevo.
    if (carpeta) await almacen.guardarCarpeta(carpeta)
    datos.current = { estado: new Map(), cierres: [], archivos: {} }
    setEstado(new Map())
    setCierres([])
    setArchivos({})
    setDescartados({})
    setInvalidos(0)
  }, [carpeta])

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
    procesarTrozo,
    nuevoCiclo,
    reiniciar,
    porUl,
    indice,
    // carpeta /TOES (solo APK)
    nativo,
    carpeta,
    vigilando,
    errorNativo,
    elegirCarpeta,
    cambiarCarpeta,
    revisar,
  }
}

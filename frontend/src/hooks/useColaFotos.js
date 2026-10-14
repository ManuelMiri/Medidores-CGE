// useColaFotos.js
// Sube sola las fotos que quedaron esperando señal (utils/colaFotos.js).
//
// Lo intenta al abrir la app, cuando Android avisa que volvió la red, al
// volver a la app y cada minuto mientras quede algo. `online` solo no
// alcanza: en terreno el teléfono puede estar "conectado" a una antena que no
// deja pasar nada, y ese evento no se repite.

import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import { EVENTO, listarPendientes, subirTodas } from '../utils/colaFotos'

const CADA_MS = 60000

export function useColaFotos(onSubidas) {
  const [pendientes, setPendientes] = useState([])
  const [subiendo, setSubiendo] = useState(false)
  const enVuelo = useRef(false)
  const onSubidasRef = useRef(onSubidas)
  useEffect(() => { onSubidasRef.current = onSubidas }, [onSubidas])

  const refrescar = useCallback(async () => {
    setPendientes(await listarPendientes())
  }, [])

  const intentar = useCallback(async (manual = false) => {
    if (enVuelo.current) return
    enVuelo.current = true
    if (manual) setSubiendo(true)
    try {
      const n = await subirTodas(api, { manual })
      if (n > 0) onSubidasRef.current?.()
    } finally {
      enVuelo.current = false
      setSubiendo(false)
    }
  }, [])

  useEffect(() => {
    refrescar()
    intentar()
    const alCambiar = () => { refrescar() }
    const alVolverRed = () => { intentar() }
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }
    window.addEventListener(EVENTO, alCambiar)
    window.addEventListener('online', alVolverRed)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      window.removeEventListener(EVENTO, alCambiar)
      window.removeEventListener('online', alVolverRed)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [refrescar, intentar])

  const hayPendientes = pendientes.length > 0
  useEffect(() => {
    if (!hayPendientes) return
    const id = setInterval(() => { intentar() }, CADA_MS)
    return () => clearInterval(id)
  }, [hayPendientes, intentar])

  const reintentar = useCallback(() => intentar(true), [intentar])
  return { pendientes, subiendo, reintentar }
}

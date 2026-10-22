// useMarcasPendientes.js
// Las marcas por confirmar de todas las ULs (GET /medidores/marcas-pendientes),
// para el modo revisión del mapa. Solo admin y supervisor, que son quienes
// pueden confirmar: a los demás no les pide nada.
//
// `estado` distingue "todavía no llega" de "el servidor no contestó" (sin señal,
// o un backend sin la ruta): en los dos casos no hay número que mostrar, pero
// no es lo mismo que cero pendientes.

import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

export function useMarcasPendientes(habilitado) {
  const [medidores, setMedidores] = useState([])
  const [estado, setEstado] = useState('cargando') // 'cargando' | 'ok' | 'error'

  const recargar = useCallback(async () => {
    if (!habilitado) return
    try {
      const { data } = await api.get('/medidores/marcas-pendientes', { timeout: 20000 })
      setMedidores(data?.medidores ?? [])
      setEstado('ok')
    } catch {
      // Lo que ya se tenía se queda: una recarga fallida no vacía la lista.
      setEstado((e) => (e === 'ok' ? 'ok' : 'error'))
    }
  }, [habilitado])

  useEffect(() => { recargar() }, [recargar])

  return { medidores, estado, recargar }
}

// useSubidasUl.js
// Quién subió cada UL marcada, para que un admin lo vea en el panel de TOES
// (GET /api/rutas/subidas, que es solo de admin). Para los demás no pide nada.
//
// Es un dato de referencia: sin señal, o con un backend que todavía no tiene
// la ruta (404), simplemente no se muestra.

import { useEffect, useState } from 'react'
import api from '../services/api'

export function useSubidasUl(ulsActivas, esAdmin) {
  const [porUl, setPorUl] = useState({})
  // Un texto y no el array: el efecto se rearma solo si cambian las ULs.
  const uls = esAdmin ? [...ulsActivas].sort().join(',') : ''

  useEffect(() => {
    if (!uls) return
    let vigente = true
    api.get(`/rutas/subidas?ul=${encodeURIComponent(uls)}`, { timeout: 20000 })
      .then(({ data }) => {
        if (vigente) setPorUl(Object.fromEntries((data?.subidas ?? []).map((s) => [s.ul, s])))
      })
      .catch(() => {})
    return () => { vigente = false }
  }, [uls])

  return porUl
}

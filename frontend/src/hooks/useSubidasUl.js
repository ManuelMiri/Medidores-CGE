// useSubidasUl.js
// Quién subió cada UL marcada, para que un admin lo vea en el panel, arriba
// del Resumen (GET /api/rutas/subidas, que es solo de admin). Para los demás
// no pide nada.
//
// `cargado` dice si la respuesta es la de las ULs marcadas ahora: sin eso, una
// UL recién marcada se vería "sin registro" mientras llega la respuesta, y lo
// mismo sin señal o con un backend que todavía no tiene la ruta (404).

import { useEffect, useState } from 'react'
import api from '../services/api'

export function useSubidasUl(ulsActivas, esAdmin) {
  const [datos, setDatos] = useState({ para: null, porUl: {} })
  // Un texto y no el array: el efecto se rearma solo si cambian las ULs.
  const uls = esAdmin ? [...ulsActivas].sort().join(',') : ''

  useEffect(() => {
    if (!uls) return
    let vigente = true
    api.get(`/rutas/subidas?ul=${encodeURIComponent(uls)}`, { timeout: 20000 })
      .then(({ data }) => {
        if (!vigente) return
        setDatos({ para: uls, porUl: Object.fromEntries((data?.subidas ?? []).map((s) => [s.ul, s])) })
      })
      .catch(() => {})
    return () => { vigente = false }
  }, [uls])

  return { porUl: datos.porUl, cargado: Boolean(uls) && datos.para === uls }
}

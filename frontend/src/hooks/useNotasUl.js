// useNotasUl.js
// Las notas de las ULs marcadas ("Clave del portón: 123456").
//
// Se guarda una copia en el teléfono a propósito: la clave de un portón se
// necesita justo frente al portón, que en el Maule rural es justo donde no hay
// señal. Sin red se muestra lo último que se bajó y se avisa que puede no
// estar al día.

import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

const claveCopia = (ul) => `notasUl:${ul}`

function leerCopia(ul) {
  try {
    const lista = JSON.parse(localStorage.getItem(claveCopia(ul)) ?? 'null')
    return Array.isArray(lista) ? lista : null
  } catch {
    return null
  }
}

function guardarCopia(ul, notas) {
  try { localStorage.setItem(claveCopia(ul), JSON.stringify(notas)) } catch { /* sin storage, da igual */ }
}

export function useNotasUl(ulsActivas) {
  // { [ul]: { notas: [...], sinRed: bool } }
  const [porUl, setPorUl] = useState({})

  const cargar = useCallback(async (ul) => {
    try {
      const { data } = await api.get(`/rutas/${encodeURIComponent(ul)}/notas`)
      guardarCopia(ul, data.notas)
      setPorUl((p) => ({ ...p, [ul]: { notas: data.notas, sinRed: false } }))
    } catch (err) {
      // Si el servidor contestó (403: la UL ya no es tuya) la copia vieja no
      // sirve; si no contestó nadie, es la señal y la copia es lo mejor que hay.
      const copia = err?.response ? [] : (leerCopia(ul) ?? [])
      setPorUl((p) => ({ ...p, [ul]: { notas: copia, sinRed: !err?.response } }))
    }
  }, [])

  useEffect(() => {
    for (const ul of ulsActivas) {
      // La copia primero, para que se vea al tiro aunque la red tarde.
      const copia = leerCopia(ul)
      if (copia) setPorUl((p) => (p[ul] ? p : { ...p, [ul]: { notas: copia, sinRed: false } }))
      cargar(ul)
    }
  }, [ulsActivas, cargar])

  const agregar = useCallback(async (ul, texto) => {
    await api.post(`/rutas/${encodeURIComponent(ul)}/notas`, { texto })
    await cargar(ul)
  }, [cargar])

  // Editar el texto u ocultar (`{ visible: false }`). Nunca se borra.
  const cambiar = useCallback(async (ul, id, cambios) => {
    await api.patch(`/rutas/${encodeURIComponent(ul)}/notas/${id}`, cambios)
    await cargar(ul)
  }, [cargar])

  return { porUl, agregar, cambiar }
}

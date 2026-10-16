// useReintentoSinSenal.js
// Mientras el mapa muestre la copia del teléfono (o nada) por falta de señal,
// vuelve a pedir los datos solo: cuando Android avisa que volvió la red, al
// volver a la app y cada minuto. Igual que la cola de fotos: `online` solo no
// alcanza, porque en terreno el teléfono puede estar "conectado" a una antena
// que no deja pasar nada, y ese evento no se repite.

import { useEffect, useRef } from 'react'

const CADA_MS = 60000

export function useReintentoSinSenal(activo, reintentar) {
  // En una ref para que el efecto no se rearme en cada render: `reintentar`
  // cambia de identidad cuando cambian las ULs marcadas.
  const ref = useRef(reintentar)
  useEffect(() => { ref.current = reintentar }, [reintentar])

  useEffect(() => {
    if (!activo) return
    const intentar = () => { ref.current?.() }
    const alVolver = () => { if (document.visibilityState === 'visible') intentar() }
    window.addEventListener('online', intentar)
    document.addEventListener('visibilitychange', alVolver)
    const id = setInterval(intentar, CADA_MS)
    return () => {
      window.removeEventListener('online', intentar)
      document.removeEventListener('visibilitychange', alVolver)
      clearInterval(id)
    }
  }, [activo])
}

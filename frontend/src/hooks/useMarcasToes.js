// useMarcasToes.js
// Lleva al servidor lo que TOES dice sobre los puntos donde ya no hay medidor.
//
// Es la única parte de la integración con TOES que escribe en el backend, y es
// a propósito: la marca tiene que verla el lector del mes siguiente, que puede
// ser otra persona y otro teléfono, así que no puede vivir solo en IndexedDB.
//
// Lo que viaja es el mínimo: instalación, tipo de marca, clave y ciclo. Nunca
// la dirección, la lectura ni las coordenadas que trae el log — eso se queda
// en el teléfono, como manda el spec.

import { useEffect, useRef } from 'react'
import api from '../services/api'
import { accionesDeMarca, claveDeAccion } from '../utils/marcasToes'

export function useMarcasToes(medidores, indice, config, onCambio) {
  // Acciones ya intentadas en esta sesión, para no repetirlas en cada vuelta
  // del sondeo de 5 s mientras la primera todavía va en camino.
  const intentadas = useRef(new Set())

  const onCambioRef = useRef(onCambio)
  useEffect(() => { onCambioRef.current = onCambio }, [onCambio])

  useEffect(() => {
    if (!medidores?.length || !indice?.porInstalacion?.size) return

    const pendientes = accionesDeMarca(medidores, indice, config)
      .filter((a) => !intentadas.current.has(claveDeAccion(a)))
    if (!pendientes.length) return

    let vivo = true
    ;(async () => {
      let hubo = false
      for (const a of pendientes) {
        const clave = claveDeAccion(a)
        intentadas.current.add(clave)
        try {
          if (a.accion === 'proponer') {
            await api.post(`/medidores/${a.instalacion}/marca`, {
              tipo: a.tipo, claveToes: a.claveToes, cicloOrigen: a.cicloOrigen,
            })
          } else {
            await api.delete(`/medidores/${a.instalacion}/marca`)
          }
          hubo = true
        } catch (err) {
          // Si el servidor contestó (404 por una UL que no es suya, 403…), el
          // error no se arregla reintentando: queda marcada para no insistir
          // cada 5 s. Si no contestó nadie, fue la red: se saca de la lista
          // para que la próxima vuelta lo intente de nuevo.
          if (!err?.response) intentadas.current.delete(clave)
        }
      }
      // Recargar para que el mapa pinte las marcas nuevas. Si no hubo ningún
      // cambio no se recarga: sería una petición por vuelta del sondeo.
      if (hubo && vivo) onCambioRef.current?.()
    })()

    return () => { vivo = false }
  }, [medidores, indice, config])
}

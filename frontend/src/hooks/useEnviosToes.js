// useEnviosToes.js
// Lo que la app manda sola al servidor a partir del log de TOES, además de
// la marca permanente (useMarcasToes):
//   - useCambiosToes: el cambio de medidor (serie y marca nuevas)
//   - useAltasToes:   el pin de un servicio tomado que no estaba en el mapa
//
// Cada uno es una excepción aprobada a "el log no sale del teléfono" y manda
// solo lo que dice CLAUDE.md. Las reglas de QUÉ mandar viven en utils/ con
// tests (cambiosToes.js, altasToes.js); acá solo está el envío.

import { useEffect, useMemo, useRef } from 'react'
import api from '../services/api'
import { accionesDeCambio, claveDeCambio } from '../utils/cambiosToes'
import { altasPendientes } from '../utils/altasToes'

/**
 * Manda cada acción una vez por sesión. Si el servidor contestó (aunque sea
 * con un error), no se insiste: reintentar no lo arregla y serían peticiones
 * cada 5 s. Si no contestó nadie fue la red, y se reintenta en la próxima
 * vuelta, que es lo que pasa en terreno sin señal.
 */
function useEnvios(acciones, claveDe, enviar, onCambio) {
  const intentadas = useRef(new Set())
  const onCambioRef = useRef(onCambio)
  useEffect(() => { onCambioRef.current = onCambio }, [onCambio])
  const enviarRef = useRef(enviar)
  useEffect(() => { enviarRef.current = enviar }, [enviar])

  useEffect(() => {
    const pendientes = acciones.filter((a) => !intentadas.current.has(claveDe(a)))
    if (!pendientes.length) return

    let vivo = true
    ;(async () => {
      let hubo = false
      for (const a of pendientes) {
        const clave = claveDe(a)
        intentadas.current.add(clave)
        try {
          if (await enviarRef.current(a)) hubo = true
        } catch (err) {
          if (!err?.response) intentadas.current.delete(clave)
        }
      }
      if (hubo && vivo) onCambioRef.current?.()
    })()
    return () => { vivo = false }
  }, [acciones, claveDe])
}

export function useCambiosToes(medidores, cambiosMedidor, onCambio) {
  const acciones = useMemo(
    () => accionesDeCambio(medidores, cambiosMedidor),
    [medidores, cambiosMedidor]
  )
  useEnvios(acciones, claveDeCambio, enviarCambio, onCambio)
}

async function enviarCambio(a) {
  await api.post(`/medidores/${encodeURIComponent(a.instalacion)}/cambio-medidor`, {
    serie: a.serie, marca: a.marca, serieAnterior: a.serieAnterior, ciclo: a.ciclo, fecha: a.fecha,
  })
  return true
}

/**
 * Devuelve las ULs donde se frenó la creación automática (demasiados
 * faltantes: lo más probable es que la lista de medidores esté incompleta),
 * para que el panel lo pueda decir en vez de fallar callado.
 */
export function useAltasToes(medidores, porUl, ulsActivas, onCambio) {
  const { altas, bloqueadas } = useMemo(
    () => altasPendientes(medidores, porUl, ulsActivas),
    [medidores, porUl, ulsActivas]
  )
  useEnvios(altas, claveDeAlta, enviarAlta, onCambio)
  return bloqueadas
}

const claveDeAlta = (a) => `${a.completar ? 'completar' : 'crear'}|${a.instalacion}`

// La misma ruta crea el pin o, si ya lo había creado la app, le completa la
// dirección y el poste. Nunca la lectura.
async function enviarAlta(a) {
  const { data } = await api.post('/medidores/desde-toes', {
    instalacion: a.instalacion, ul: a.ul, lat: a.lat, lng: a.lng,
    serie: a.serie, marca: a.marca, direccion: a.direccion, poste: a.poste,
    ciclo: a.ciclo, fecha: a.fecha,
  })
  return Boolean(data?.creado || data?.completado)
}

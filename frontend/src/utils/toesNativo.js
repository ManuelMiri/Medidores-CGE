// toesNativo.js
// Puente con el plugin nativo (cl.mla.maule.toes.ToesPlugin) que lee la carpeta
// TOES del teléfono por el Storage Access Framework.
//
// Existe porque la PWA sola no puede: Chrome en Android no expone
// showDirectoryPicker(), y desde Android 11 una app no puede abrir rutas
// arbitrarias del almacenamiento compartido. Con SAF el lector elige la carpeta
// una vez y el permiso sobrevive a los reinicios.
//
// Todo lo que hay acá es de SOLO LECTURA. El log es la fuente de verdad de la
// lectura del mes de CGE y su contenido no sale del teléfono: se lee, se saca
// lo que el mapa necesita y el texto se descarta.

import { Capacitor, registerPlugin } from '@capacitor/core'
import { cursorInicial, topeSiguiente, TOPE_INICIAL } from './cursorToes.js'

const Toes = registerPlugin('Toes')

/** Código con el que el plugin avisa que hay que volver a pedir la carpeta. */
export const SIN_PERMISO = 'SIN_PERMISO'

/**
 * Si este entorno tiene el plugin. En el navegador no lo tiene, y ahí el
 * camino sigue siendo elegir los archivos a mano con <input type="file">.
 */
export function hayPluginNativo() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** ¿Es el error de "ya no tenemos la carpeta"? */
export const esSinPermiso = (err) => err?.code === SIN_PERMISO

/**
 * Carpeta que Android todavía nos tiene concedida, o null.
 *
 * Se le pregunta al plugin en vez de confiar en lo guardado en IndexedDB: el
 * permiso se puede revocar desde los ajustes del teléfono, y al revés, si se
 * limpian los datos del WebView se pierde el URI guardado pero el permiso
 * sigue vivo. El plugin sabe la verdad en los dos sentidos.
 */
export async function carpetaConcedida(uriGuardada) {
  if (!hayPluginNativo()) return null
  try {
    const r = await Toes.carpetaActual({ uri: uriGuardada ?? null })
    return r?.uri ?? null
  } catch {
    return null
  }
}

/** Abre el selector de carpetas de Android. Devuelve el URI, o null si canceló. */
export async function pedirCarpeta() {
  const r = await Toes.elegirCarpeta()
  if (r?.cancelado) return null
  return r?.uri ?? null
}

export async function olvidarCarpeta(uri) {
  if (!hayPluginNativo() || !uri) return
  try {
    await Toes.olvidarCarpeta({ uri })
  } catch {
    // si ya no lo teníamos, el resultado buscado es el mismo
  }
}

/**
 * Lee todo lo que haya de nuevo en la carpeta y se lo pasa a `procesar`.
 *
 * `procesar(nombre, texto, meta)` tiene que devolver cuántos bytes avanzar el
 * cursor (lo que calcula `avanceDeCursor` después de parsear) y es quien
 * persiste el progreso. Así el parseo ocurre una sola vez: acá no se vuelve a
 * mirar el texto.
 *
 * Devuelve { eventos, archivos } — cuántos servicios nuevos entraron y cuántos
 * archivos se tocaron.
 */
export async function leerNovedades(uri, archivosConocidos, procesar) {
  const { archivos: lista = [] } = await Toes.listarLogs({ uri })

  let eventos = 0
  let tocados = 0

  // En orden cronológico. El nombre Log_TOES-AAAA-MM-DD_HHMMSS ordena igual
  // que el tiempo, y el orden importa: un cierre se ata al ciclo que estaba
  // vigente cuando se aplicó.
  for (const info of lista) {
    let cursor = cursorInicial(archivosConocidos?.[info.nombre], info.tamano)
    if (cursor >= info.tamano) continue // nada nuevo en este archivo

    let tope = TOPE_INICIAL
    let avanzoAlgo = false

    while (cursor < info.tamano) {
      const r = await Toes.leerLog({ uri, nombre: info.nombre, desde: cursor, tope })
      const bytesLeidos = r?.bytes ?? 0
      const tamano = r?.tamano ?? info.tamano
      const hayMas = cursor + bytesLeidos < tamano

      const res = await procesar(info.nombre, r?.texto ?? '', {
        desde: cursor,
        bytesLeidos,
        tamano,
        hayMas,
      })
      eventos += res?.eventos ?? 0

      const avance = res?.avance ?? 0
      if (avance > 0) {
        cursor += avance
        avanzoAlgo = true
        continue
      }
      // El cursor no se movió. Si el archivo sigue más allá de lo que leímos,
      // es porque un bloque no entró completo en la ventana: se reintenta el
      // mismo cursor pidiendo más. Si no, lo que queda es la cola que TOES
      // está escribiendo ahora y se vuelve a leer en la próxima vuelta.
      if (!hayMas) break
      const mayor = topeSiguiente(tope)
      if (!mayor) break
      tope = mayor
    }

    if (avanzoAlgo) tocados++
  }

  return { eventos, archivos: tocados }
}

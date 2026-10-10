// Habla con el WebView del APK por el protocolo de DevTools de Chrome.
//
// Para que existe: el script de medicion necesita dejar el mapa en una vista
// EXACTA antes de cada corrida. Sin eso, entre dos corridas cambia la cantidad
// de marcadores en pantalla — la variable que mas pesa — y comparar dos builds
// no significa nada. Eso ya paso: los numeros se movian entre 0,3 % y 100 % de
// frames janky sin que el codigo cambiara.
//
// adb solo sabe de toques y de coordenadas de pantalla, asi que no alcanza: un
// toque en el boton + del zoom depende del layout y no deja el mapa en un lugar
// conocido. Por DevTools se puede evaluar JavaScript en la pagina y llamar a
// window.fluidez.irA(lat, lng, zoom), que es exacto y no depende del layout.
//
// Sin dependencias nuevas, como el resto del repo: Node 22 ya trae fetch y
// WebSocket globales.
//
// Solo funciona en builds de debug: el WebView es inspeccionable porque
// Capacitor lo habilita ahi. En un release no habria socket que buscar, que es
// como tiene que ser.

import { spawnSync } from 'node:child_process'

const PUERTO = 9222

function adbSync(adb, args) {
  const r = spawnSync(adb, args, { encoding: 'utf8' })
  if (r.error) throw new Error('No se pudo ejecutar adb: ' + r.error.message)
  return r.stdout ?? ''
}

/**
 * El nombre del socket de DevTools del WebView.
 *
 * Se lee de /proc/net/unix porque es donde Android lista los sockets de dominio
 * abiertos, y el del WebView se llama webview_devtools_remote_<pid>. Buscarlo
 * asi evita tener que averiguar el pid por otro lado y acertarle al que
 * corresponde cuando hay varios procesos.
 */
export function buscarSocket(adb, paquete) {
  const salida = adbSync(adb, ['shell', 'cat', '/proc/net/unix'])
  const nombres = salida
    .split('\n')
    .map((l) => l.trim().split(/\s+/).pop())
    .filter((n) => n && n.includes('webview_devtools_remote'))
    .map((n) => n.replace(/^@/, ''))

  if (!nombres.length) return null

  // Con varios WebView abiertos gana el del paquete que nos interesa. El pid
  // del socket se compara contra el pid del proceso.
  const pid = adbSync(adb, ['shell', 'pidof', paquete]).trim().split(/\s+/)[0]
  if (pid) {
    const propio = nombres.find((n) => n.endsWith('_' + pid))
    if (propio) return propio
  }
  return nombres[0]
}

/** Abre el túnel y devuelve la URL del WebSocket de la página del mapa. */
export async function conectar(adb, paquete) {
  const socket = buscarSocket(adb, paquete)
  if (!socket) {
    throw new Error(
      'No encontre el socket de DevTools del WebView.\n' +
      'Pasa solo en builds de debug; revisa que la app este abierta.'
    )
  }

  adbSync(adb, ['forward', 'tcp:' + PUERTO, 'localabstract:' + socket])

  const r = await fetch('http://127.0.0.1:' + PUERTO + '/json')
  const objetivos = await r.json()
  // La pagina de la app es la unica con esquema https://localhost — es el
  // androidScheme de Capacitor. Lo demas pueden ser service workers.
  const pagina = objetivos.find(
    (o) => o.type === 'page' && typeof o.webSocketDebuggerUrl === 'string'
  )
  if (!pagina) throw new Error('El WebView no expone ninguna pagina inspeccionable')
  return pagina.webSocketDebuggerUrl
}

export function cerrar(adb) {
  adbSync(adb, ['forward', '--remove', 'tcp:' + PUERTO])
}

/**
 * Evalua una expresion en la pagina y devuelve su valor.
 *
 * Abre y cierra un WebSocket por llamada a proposito: son dos o tres por
 * corrida y asi no hay que llevar estado ni reconectar si el WebView se
 * recarga en medio.
 */
export function evaluar(urlWs, expresion, msTope = 10000) {
  return new Promise((resolver, rechazar) => {
    const ws = new WebSocket(urlWs)
    const reloj = setTimeout(() => {
      try { ws.close() } catch { /* ya estaba cerrado */ }
      rechazar(new Error('El WebView no contesto en ' + msTope + ' ms'))
    }, msTope)

    const terminar = (fn, valor) => {
      clearTimeout(reloj)
      try { ws.close() } catch { /* ya estaba cerrado */ }
      fn(valor)
    }

    ws.onerror = () => terminar(rechazar, new Error('No se pudo abrir el WebSocket de DevTools'))

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        // returnByValue para que vuelva el objeto y no una referencia remota,
        // y await por si la expresion es una promesa.
        params: { expression: expresion, returnByValue: true, awaitPromise: true },
      }))
    }

    ws.onmessage = (e) => {
      let msg
      try { msg = JSON.parse(e.data) } catch { return }
      if (msg.id !== 1) return

      if (msg.error) {
        terminar(rechazar, new Error('DevTools: ' + msg.error.message))
        return
      }
      const r = msg.result
      if (r?.exceptionDetails) {
        const texto = r.exceptionDetails.exception?.description
          ?? r.exceptionDetails.text
        terminar(rechazar, new Error('La pagina lanzo: ' + texto))
        return
      }
      terminar(resolver, r?.result?.value)
    }
  })
}

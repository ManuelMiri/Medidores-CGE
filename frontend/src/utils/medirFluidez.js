// medirFluidez.js
// Instrumentación para poder AFIRMAR que el mapa quedó más fluido, en vez de
// decir que se siente mejor.
//
// Por qué existe: "arrastrar se siente a saltos" no es falsable. Este repo tiene
// la costumbre de afirmar cosas medidas (los 3 ms del parser, los 1.093 tiles
// del caché, el 52,7 % de pines que saca TOES), y una tanda de rendimiento sin
// línea base es la única forma segura de trabajar mucho y no saber si sirvió.
//
// Mide dos cosas distintas y las dos hacen falta:
//
//   - `adb shell dumpsys gfxinfo cl.mla.maule framestats` dice lo que de verdad
//     se vio: cuántos frames llegaron tarde. Es el veredicto.
//   - Esto de acá dice QUIÉN los hizo llegar tarde: las long tasks son el
//     JavaScript que bloqueó el hilo principal más de 50 ms. Sin esto, gfxinfo
//     dice que hubo jank pero no de dónde salió.
//
// NO va detrás de `import.meta.env.DEV`. El APK se compila con
// `vite build --mode native`, donde DEV es false: con ese gate el código no
// entraría al APK y el APK es exactamente lo que hay que medir. Va detrás de un
// flag en localStorage, así que en release está presente pero inerte — no crea
// ni un observer hasta que alguien lo prende a mano.
//
// Uso, con el WebView ya inspeccionable (adb forward, ver README):
//   localStorage.setItem('medirFluidez', 'si')   // y recargar
//   fluidez.reiniciar()                          // antes del gesto
//   ...arrastrar / hacer zoom...
//   fluidez.informe()                            // la tabla

const CLAVE = 'medirFluidez'

// 50 ms es el umbral de la Long Tasks API, no un número elegido acá: por debajo
// de eso el navegador considera que la tarea no alcanzó a costar un frame.
const UMBRAL_TAREA_MS = 50

// A 60 Hz un frame dura 16,7 ms. Lo que pase de ahí se vio como un salto.
const PRESUPUESTO_FRAME_MS = 1000 / 60

export function medicionActiva() {
  try { return localStorage.getItem(CLAVE) === 'si' } catch { return false }
}

/** El percentil de una lista de duraciones, en ms. */
function percentil(ordenadas, p) {
  if (!ordenadas.length) return 0
  // -1 porque el índice del percentil 100 es el último elemento, no el largo.
  const i = Math.min(ordenadas.length - 1, Math.floor((p / 100) * ordenadas.length))
  return ordenadas[i]
}

/**
 * Arranca la medición. Devuelve null si el flag no está puesto, y en ese caso
 * no deja nada corriendo: ni observer, ni requestAnimationFrame.
 */
export function iniciarMedicionFluidez() {
  if (!medicionActiva()) return null

  let tareas = []
  let frames = []
  let desde = performance.now()
  let rafId = null
  let ultimoFrame = null

  // Las long tasks son el JS que bloqueó el hilo principal. `buffered` trae
  // también las que ocurrieron antes de que esto corriera, que son justo las
  // del arranque del mapa.
  let observer = null
  try {
    observer = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) tareas.push(e.duration)
    })
    observer.observe({ type: 'longtask', buffered: true })
  } catch {
    // Un WebView viejo puede no tener longtask. El muestreo de frames igual
    // sirve, así que se sigue sin ella en vez de no medir nada.
  }

  // El tiempo entre frames se mide con rAF y no con la Frame Timing API, que
  // no está en el WebView de Android. Es una aproximación: rAF no corre cuando
  // la pestaña está oculta, de ahí el descarte de los saltos enormes.
  function muestrear(ahora) {
    if (ultimoFrame != null) {
      const delta = ahora - ultimoFrame
      // Más de medio segundo no es jank: es la app en segundo plano o el
      // teléfono bloqueado. Contarlo arruinaría el p95.
      if (delta < 500) frames.push(delta)
    }
    ultimoFrame = ahora
    rafId = requestAnimationFrame(muestrear)
  }
  rafId = requestAnimationFrame(muestrear)

  const api = {
    reiniciar() {
      tareas = []
      frames = []
      desde = performance.now()
      ultimoFrame = null
      return 'midiendo'
    },

    informe() {
      const ventana = performance.now() - desde
      const t = [...tareas].sort((a, b) => a - b)
      const f = [...frames].sort((a, b) => a - b)
      const lentos = f.filter((d) => d > PRESUPUESTO_FRAME_MS).length

      // El tiempo de bloqueo total es la parte de cada long task que pasa del
      // umbral, igual que lo define Lighthouse (TBT). Suma mejor que el conteo:
      // una tarea de 400 ms molesta mucho más que ocho de 55 ms.
      const bloqueo = t.reduce((a, d) => a + Math.max(0, d - UMBRAL_TAREA_MS), 0)

      const r = {
        ventana_s: +(ventana / 1000).toFixed(1),
        // --- lo que se vio
        frames: f.length,
        fps_medio: f.length ? +(1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1) : 0,
        frame_p50_ms: +percentil(f, 50).toFixed(1),
        frame_p95_ms: +percentil(f, 95).toFixed(1),
        frame_p99_ms: +percentil(f, 99).toFixed(1),
        frames_lentos: lentos,
        frames_lentos_pct: f.length ? +((lentos / f.length) * 100).toFixed(1) : 0,
        // --- quién lo causó
        long_tasks: t.length,
        tarea_p95_ms: +percentil(t, 95).toFixed(1),
        tarea_peor_ms: t.length ? +t[t.length - 1].toFixed(1) : 0,
        bloqueo_total_ms: Math.round(bloqueo),
      }
      // console.table sale legible en `adb logcat | grep Capacitor/Console`,
      // que es la única forma de leer la consola del APK.
      console.table(r)
      return r
    },

    detener() {
      observer?.disconnect()
      observer = null
      if (rafId != null) cancelAnimationFrame(rafId)
      rafId = null
      return 'detenido'
    },
  }

  return api
}

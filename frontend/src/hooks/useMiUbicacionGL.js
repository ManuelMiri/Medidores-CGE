// useMiUbicacionGL.js
// El punto azul de "mi ubicación" sobre el mapa de MapLibre.
//
// Es la contraparte de components/MiUbicacion.jsx, que hace lo mismo con
// Leaflet. Mismo aspecto a propósito: el mismo azul, el mismo halo pulsante y
// la misma flecha de brújula, porque el lector ya los tiene aprendidos.
//
// Dos cosas se conservan del original porque costaron:
//
//   - El icono se construye UNA vez y el rumbo se aplica como style.transform
//     sobre el div de la flecha. Rehacer el nodo en cada evento de brújula
//     (que dispara a ~60 Hz) no solo costaba caro: la animación del halo y la
//     transición de la flecha NUNCA llegaban a verse, porque el nodo se
//     reemplazaba antes de que avanzaran.
//   - Los mensajes de error distinguen permiso denegado (se arregla en
//     ajustes) de GPS sin señal (se arregla en terreno). Son acciones
//     distintas y "no se pudo obtener tu ubicación" no las separa.
//
// Lo propio de MapLibre es el círculo de precisión: no hay un L.circle que
// reciba metros, así que se dibuja como un polígono en una fuente GeoJSON. Eso
// además lo deja correcto a cualquier zoom sin tener que convertir metros a
// píxeles a mano.

import { useEffect, useRef } from 'react'
import { Marker } from 'maplibre-gl'

const COLOR_PUNTO = '#1a73e8'
const FUENTE_PRECISION = 'miPrecision'
const CAPA_PRECISION = 'miPrecision'

/** Cada cuánto se le hace caso a la brújula, como mucho. */
const CADA_MS_RUMBO = 100
/** Giro mínimo que vale la pena dibujar, en grados. */
const GRADOS_MINIMOS = 2
/** Lados del polígono del círculo de precisión. 48 ya se ve redondo. */
const LADOS = 48

let estilosInyectados = false
function inyectarEstilosUnaVez() {
  if (estilosInyectados) return
  const style = document.createElement('style')
  style.textContent = `
    @keyframes pulso-mi-ubicacion {
      0%   { transform: scale(1);   opacity: 0.55; }
      70%  { transform: scale(2.4); opacity: 0; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  `
  document.head.appendChild(style)
  estilosInyectados = true
}

function crearElemento() {
  inyectarEstilosUnaVez()
  const div = document.createElement('div')
  div.style.cssText = 'position: relative; width: 28px; height: 28px;'
  div.innerHTML = `
    <div style="
      position: absolute; inset: 0;
      border-radius: 50%;
      background: ${COLOR_PUNTO};
      animation: pulso-mi-ubicacion 1.8s ease-out infinite;
    "></div>
    <div class="flecha-mi-ubicacion" style="
      position: absolute; inset: 0;
      transition: transform 0.15s linear;
      display: flex; align-items: center; justify-content: center;
    ">
      <svg width="20" height="20" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="${COLOR_PUNTO}" stroke="#ffffff" stroke-width="3"/>
        <path d="M12 3 L16 12 L12 10 L8 12 Z" fill="#ffffff"/>
      </svg>
    </div>
  `
  return div
}

/** Diferencia angular con signo, en [-180, 180]. Sin esto, pasar de 359° a 1°
 *  parecería un giro de 358 grados y no de 2. */
function diferenciaAngular(a, b) {
  return ((a - b + 540) % 360) - 180
}

/** El círculo de precisión como polígono, en grados. */
function circuloGeoJson(lat, lng, metros) {
  if (!metros) return { type: 'FeatureCollection', features: [] }
  // Mismo criterio que utils/agrupar.js: a estas distancias alcanza con pasar
  // grados a metros a mano, sin fórmulas de geodesia.
  const dLat = metros / 110540
  const dLng = metros / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.01))
  const anillo = []
  for (let i = 0; i <= LADOS; i++) {
    const a = (i / LADOS) * 2 * Math.PI
    anillo.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)])
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [anillo] }, properties: {} }],
  }
}

export function useMiUbicacionGL(mapa, activo, onError) {
  const marcadorRef = useRef(null)
  const flechaRef = useRef(null)
  const rumboRef = useRef(null)
  const rumboEnRef = useRef(0)
  const yaCentroRef = useRef(false)
  const yaAvisoRef = useRef(false)

  // function y no const: la llaman efectos declarados más abajo, y una function
  // sí se hoistea. Un const referenciado antes de su línea revienta el render
  // con "Cannot access before initialization" y deja la app en blanco.
  function aplicarRumbo() {
    const flecha = flechaRef.current
    if (flecha && rumboRef.current != null) {
      flecha.style.transform = `rotate(${rumboRef.current}deg)`
    }
  }

  // GPS en vivo — solo mientras esté prendido, para no gastar batería de por
  // vida cuando el técnico no lo está usando.
  useEffect(() => {
    if (!mapa || !activo) return

    if (!navigator.geolocation) {
      onError?.('Este dispositivo no permite obtener la ubicación', true)
      return
    }
    yaAvisoRef.current = false
    yaCentroRef.current = false

    // La capa del círculo de precisión va POR DEBAJO del marcador, que es un
    // elemento del DOM encima del canvas, así que el orden sale solo.
    if (!mapa.getSource(FUENTE_PRECISION)) {
      mapa.addSource(FUENTE_PRECISION, { type: 'geojson', data: circuloGeoJson(0, 0, 0) })
      mapa.addLayer({
        id: CAPA_PRECISION,
        type: 'fill',
        source: FUENTE_PRECISION,
        paint: { 'fill-color': COLOR_PUNTO, 'fill-opacity': 0.06, 'fill-outline-color': COLOR_PUNTO },
      })
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        yaAvisoRef.current = false // volvió a haber señal
        const { latitude: lat, longitude: lng, accuracy } = pos.coords

        if (!marcadorRef.current) {
          const el = crearElemento()
          flechaRef.current = el.querySelector('.flecha-mi-ubicacion')
          marcadorRef.current = new Marker({ element: el }).setLngLat([lng, lat]).addTo(mapa)
          aplicarRumbo()
        } else {
          marcadorRef.current.setLngLat([lng, lat])
        }

        mapa.getSource(FUENTE_PRECISION)?.setData(circuloGeoJson(lat, lng, accuracy || 0))

        // Centra solo la primera vez: si no, no te dejaría mirar el resto del
        // mapa mientras caminas.
        if (!yaCentroRef.current) {
          mapa.easeTo({ center: [lng, lat], zoom: 17, duration: 400 })
          yaCentroRef.current = true
        }
      },
      (err) => {
        // Decirle al lector QUÉ pasó: un permiso denegado se arregla en
        // ajustes y el GPS sin fijar se arregla en terreno, son acciones
        // distintas.
        const falloPermiso = err?.code === 1 // PERMISSION_DENIED
        const mensaje = falloPermiso
          ? 'Falta el permiso de ubicación. Dáselo a la app en Ajustes → Aplicaciones → MLA Maule → Permisos.'
          : err?.code === 3 // TIMEOUT
            ? 'El GPS está tardando en fijar posición. Si estás bajo techo, sal a cielo abierto.'
            : 'No hay señal de GPS. Revisa que la ubicación del teléfono esté encendida.'

        // Solo el permiso denegado apaga el seguimiento: no se arregla solo.
        // Perder señal un rato es normal en terreno, así que ahí se avisa una
        // vez y se sigue intentando.
        if (falloPermiso) { onError?.(mensaje, true); return }
        if (yaAvisoRef.current) return
        yaAvisoRef.current = true
        onError?.(mensaje, false)
      },
      // Sin timeout, watchPosition puede quedarse callado para siempre si el
      // GPS no fija: ni posición ni error, y el lector no sabe si está roto.
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
      marcadorRef.current?.remove()
      marcadorRef.current = null
      flechaRef.current = null
      // El estilo puede haberse recreado al cambiar de capa; si la capa ya no
      // está, no hay nada que sacar.
      if (mapa.getLayer?.(CAPA_PRECISION)) mapa.removeLayer(CAPA_PRECISION)
      if (mapa.getSource?.(FUENTE_PRECISION)) mapa.removeSource(FUENTE_PRECISION)
    }
  }, [mapa, activo, onError])

  // Brújula — solo para orientar la flecha, no el mapa. El mapa se queda al
  // norte: rotarlo rompería la referencia del lector y el clic para agregar.
  useEffect(() => {
    if (!mapa || !activo) return

    function manejarOrientacion(e) {
      // webkitCompassHeading (iOS) ya viene en grados desde el norte. El
      // estándar 'alpha' viene al revés, hay que invertirlo.
      const heading = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null)
      if (heading == null) return

      // El sensor dispara a ~60 Hz. Más de 10 veces por segundo no se percibe,
      // y un giro de menos de 2° es el ruido del magnetómetro con el teléfono
      // quieto sobre la mesa, no un movimiento de la mano.
      const ahora = performance.now()
      if (ahora - rumboEnRef.current < CADA_MS_RUMBO) return
      const previo = rumboRef.current
      if (previo != null && Math.abs(diferenciaAngular(heading, previo)) < GRADOS_MINIMOS) return

      rumboEnRef.current = ahora
      rumboRef.current = heading
      aplicarRumbo()
    }

    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((r) => { if (r === 'granted') window.addEventListener('deviceorientation', manejarOrientacion) })
        .catch(() => {}) // sin permiso, simplemente no gira la flecha
    } else {
      window.addEventListener('deviceorientationabsolute', manejarOrientacion, true)
      window.addEventListener('deviceorientation', manejarOrientacion, true)
    }

    return () => {
      window.removeEventListener('deviceorientation', manejarOrientacion)
      window.removeEventListener('deviceorientationabsolute', manejarOrientacion)
    }
  }, [mapa, activo])
}

// src/components/MiUbicacion.jsx
// Muestra un punto azul en el mapa con la posición GPS del usuario (se
// actualiza en vivo mientras se mueve), y una flecha que gira según hacia
// dónde apunta el celular (brújula del dispositivo). No es lo mismo que
// "girar el mapa" — el mapa se queda quieto, orientado al norte como
// siempre; lo único que gira es la flechita que indica tu dirección. Es
// mucho más simple y no tiene riesgo de romper el clic para agregar
// medidores (que si se rotara el mapa entero, sí se rompería).
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

// Azul bien saturado en vez de un azul apagado, para que se note al
// tiro sobre el mapa (que usa tonos pasteles). Con un halo pulsante
// alrededor, como el puntito de "tu ubicación" de Google Maps.
const COLOR_PUNTO = '#1a73e8'

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

// Ícono en divIcon: siempre mide lo mismo en pantalla (28x28 px) sin
// importar cuánto zoom tenga el mapa — los marcadores en Leaflet nunca
// escalan con el zoom, a diferencia de un círculo geográfico (que sí
// crece/achica porque representa metros reales, no píxeles).
//
// Se crea UNA sola vez y NO lleva el rumbo adentro. Antes se rehacía en cada
// evento de la brújula y se pasaba por marker.setIcon(), y eso era un problema
// por partida doble:
//
//   - deviceorientation dispara a ~60 Hz, y L.DivIcon.createIcon reescribe el
//     innerHTML del marcador. O sea que el subárbol entero, con su SVG, se
//     rehacía 60 veces por segundo — con su recálculo de estilo y su pintado —
//     justo mientras el lector arrastra el mapa. Y "mi ubicación" prendido es
//     el estado normal en terreno.
//   - como el nodo se rehacía antes de que la animación avanzara, el halo
//     pulsante y la transición de 0,15 s NUNCA llegaban a verse. Se estaba
//     pagando el costo de una animación que no ocurría.
//
// Ahora el rumbo se aplica como un style.transform sobre el div de la flecha,
// que es una propiedad que compone la GPU sin rehacer nada.
let iconoCache = null
function iconoDireccion() {
  if (iconoCache) return iconoCache
  inyectarEstilosUnaVez()
  iconoCache = L.divIcon({
    className: 'icono-mi-ubicacion',
    html: `
      <div style="position: relative; width: 28px; height: 28px;">
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
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
  return iconoCache
}

/** Cada cuánto se le hace caso a la brújula, como mucho. */
const CADA_MS_RUMBO = 100
/** Giro mínimo que vale la pena dibujar, en grados. */
const GRADOS_MINIMOS = 2

/** Diferencia angular con signo, en [-180, 180]. Sin esto, pasar de 359° a 1°
 *  parecería un giro de 358 grados y no de 2. */
function diferenciaAngular(a, b) {
  return ((a - b + 540) % 360) - 180
}

export default function MiUbicacion({ activo, onError, pedidoCentrar = 0 }) {
  const map = useMap()
  const [posicion, setPosicion] = useState(null) // [lat, lng]
  // La misma posición en un ref, para el botón "centrar": si `posicion`
  // estuviera en las dependencias de ese efecto, centraría en cada lectura
  // del GPS y no te dejaría mirar el resto del mapa.
  const posicionRef = useRef(null)
  posicionRef.current = activo ? posicion : null
  const [precision, setPrecision] = useState(null) // metros
  const marcadorRef = useRef(null)
  const circuloRef = useRef(null)
  const yaCentroRef = useRef(false)

  // El rumbo NO es estado de React a propósito: nada del render depende de él,
  // así que cada lectura de la brújula costaría un render del componente para
  // terminar escribiendo un style. Vive en un ref y se aplica directo al DOM.
  const flechaRef = useRef(null) // el div que gira, dentro del icono
  const rumboRef = useRef(null) // último rumbo visto
  const rumboEnRef = useRef(0) // cuándo se aplicó, para no pasarse de 10 Hz

  // function y no const: la llaman efectos declarados más abajo, y una function
  // sí se hoistea. Un const referenciado antes de su línea revienta el render
  // con "Cannot access before initialization" y deja la app en blanco.
  function aplicarRumbo() {
    const flecha = flechaRef.current
    if (flecha && rumboRef.current != null) {
      flecha.style.transform = `rotate(${rumboRef.current}deg)`
    }
  }

  // GPS en vivo — se actualiza solo mientras 'activo' esté prendido, para
  // no gastar batería de por vida cuando el técnico no lo está usando.
  const yaAvisoRef = useRef(false)
  useEffect(() => {
    if (!activo) return
    if (!navigator.geolocation) {
      onError?.('Este dispositivo no permite obtener la ubicación', true)
      return
    }
    yaAvisoRef.current = false

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        yaAvisoRef.current = false // volvió a haber señal
        setPosicion([pos.coords.latitude, pos.coords.longitude])
        setPrecision(pos.coords.accuracy)
      },
      (err) => {
        // Decirle al lector QUÉ pasó. "No se pudo obtener tu ubicación" no
        // distingue entre un permiso denegado (que se arregla en ajustes) y
        // el GPS apagado o sin fijar posición (que se arregla en terreno), y
        // son acciones distintas.
        const falloPermiso = err?.code === 1 // PERMISSION_DENIED
        const mensaje = falloPermiso
          ? 'Falta el permiso de ubicación. Dáselo a la app en Ajustes → Aplicaciones → MLA Maule → Permisos.'
          : err?.code === 3 // TIMEOUT
            ? 'El GPS está tardando en fijar posición. Si estás bajo techo, sal a cielo abierto.'
            : 'No hay señal de GPS. Revisa que la ubicación del teléfono esté encendida.'

        // Solo el permiso denegado apaga el seguimiento: no se arregla solo.
        // Perder señal un rato es normal en terreno, así que ahí se avisa una
        // vez y se sigue intentando en vez de obligar a volver a tocar el botón.
        if (falloPermiso) {
          onError?.(mensaje, true)
          return
        }
        if (yaAvisoRef.current) return
        yaAvisoRef.current = true
        onError?.(mensaje, false)
      },
      // Sin timeout, watchPosition puede quedarse callado para siempre si el
      // GPS no fija: ni posición ni error, y el lector no sabe si está roto.
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [activo, onError])

  // Brújula del dispositivo — solo para orientar la flecha, no el mapa.
  // En iOS hay que pedir permiso explícito con un gesto del usuario; en
  // Android normalmente no hace falta.
  useEffect(() => {
    if (!activo) return

    function manejarOrientacion(e) {
      // webkitCompassHeading (iOS) ya viene en grados desde el norte.
      // El evento estándar 'alpha' viene al revés (antihorario), hay que
      // invertirlo para que la flecha apunte al lado correcto.
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
        .then((resultado) => {
          if (resultado === 'granted') {
            window.addEventListener('deviceorientation', manejarOrientacion)
          }
        })
        .catch(() => {}) // si el usuario no da permiso, simplemente no giramos la flecha
    } else {
      window.addEventListener('deviceorientationabsolute', manejarOrientacion, true)
      window.addEventListener('deviceorientation', manejarOrientacion, true)
    }

    return () => {
      window.removeEventListener('deviceorientation', manejarOrientacion)
      window.removeEventListener('deviceorientationabsolute', manejarOrientacion)
    }
  }, [activo])

  // Dibuja/actualiza el marcador y el círculo de precisión directo con la
  // API de Leaflet (más liviano que re-renderizar componentes de
  // react-leaflet en cada actualización de GPS, que puede llegar varias
  // veces por segundo).
  //
  // El rumbo NO está en las dependencias: el icono ya no depende de él, así que
  // este efecto corre al ritmo del GPS (~1 Hz) y no al de la brújula (~60 Hz).
  useEffect(() => {
    if (!activo || !posicion) {
      marcadorRef.current?.remove()
      circuloRef.current?.remove()
      marcadorRef.current = null
      circuloRef.current = null
      flechaRef.current = null
      yaCentroRef.current = false
      return
    }

    if (!marcadorRef.current) {
      marcadorRef.current = L.marker(posicion, { icon: iconoDireccion(), zIndexOffset: 1000 }).addTo(map)
      circuloRef.current = L.circle(posicion, { radius: precision || 0, color: COLOR_PUNTO, weight: 1, opacity: 0.3, fillOpacity: 0.06 }).addTo(map)
      // El div de la flecha solo existe una vez que Leaflet dibujó el icono, así
      // que se busca acá y se le aplica el rumbo que hubiera llegado antes de
      // que el marcador existiera.
      flechaRef.current = marcadorRef.current.getElement()?.querySelector('.flecha-mi-ubicacion') ?? null
      aplicarRumbo()
    } else {
      marcadorRef.current.setLatLng(posicion)
      circuloRef.current.setLatLng(posicion)
      circuloRef.current.setRadius(precision || 0)
    }

    // Centra el mapa en tu posición solo la primera vez que la obtenemos,
    // no en cada actualización — si no, no te dejaría mirar el resto del
    // mapa mientras caminas.
    if (!yaCentroRef.current) {
      map.setView(posicion, 17)
      yaCentroRef.current = true
    }
  }, [activo, posicion, precision, map])

  // Botón "centrar en mí": cada toque sube el contador. Con posición, centra
  // ya; sin ella (el GPS recién se prendió), la próxima lectura centra sola.
  useEffect(() => {
    if (!pedidoCentrar) return
    const p = posicionRef.current
    if (p) map.setView(p, Math.max(map.getZoom(), 17))
    else yaCentroRef.current = false
  }, [pedidoCentrar, map])

  return null
}

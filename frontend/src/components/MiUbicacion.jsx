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
function crearIconoDireccion(rumbo) {
  inyectarEstilosUnaVez()
  const rotacion = rumbo ?? 0
  return L.divIcon({
    className: 'icono-mi-ubicacion',
    html: `
      <div style="position: relative; width: 28px; height: 28px;">
        <div style="
          position: absolute; inset: 0;
          border-radius: 50%;
          background: ${COLOR_PUNTO};
          animation: pulso-mi-ubicacion 1.8s ease-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 0;
          transform: rotate(${rotacion}deg);
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
}

export default function MiUbicacion({ activo, onError }) {
  const map = useMap()
  const [posicion, setPosicion] = useState(null) // [lat, lng]
  const [precision, setPrecision] = useState(null) // metros
  const [rumbo, setRumbo] = useState(null) // grados, 0 = norte
  const marcadorRef = useRef(null)
  const circuloRef = useRef(null)
  const yaCentroRef = useRef(false)

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
      if (heading != null) setRumbo(heading)
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
  useEffect(() => {
    if (!activo || !posicion) {
      marcadorRef.current?.remove()
      circuloRef.current?.remove()
      marcadorRef.current = null
      circuloRef.current = null
      yaCentroRef.current = false
      return
    }

    if (!marcadorRef.current) {
      marcadorRef.current = L.marker(posicion, { icon: crearIconoDireccion(rumbo), zIndexOffset: 1000 }).addTo(map)
      circuloRef.current = L.circle(posicion, { radius: precision || 0, color: COLOR_PUNTO, weight: 1, opacity: 0.3, fillOpacity: 0.06 }).addTo(map)
    } else {
      marcadorRef.current.setLatLng(posicion)
      marcadorRef.current.setIcon(crearIconoDireccion(rumbo))
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
  }, [activo, posicion, rumbo, precision, map])

  return null
}
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

// Ícono de flecha en vez del típico puntito, para que se note hacia dónde
// mira el técnico. El div rota con CSS según el heading del dispositivo.
function crearIconoDireccion(rumbo) {
  const rotacion = rumbo ?? 0
  return L.divIcon({
    className: 'icono-mi-ubicacion',
    html: `
      <div style="
        width: 22px; height: 22px;
        transform: rotate(${rotacion}deg);
        transition: transform 0.15s linear;
      ">
        <svg width="22" height="22" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" fill="#2b6cb0" fill-opacity="0.25"/>
          <path d="M12 2 L18 20 L12 16 L6 20 Z" fill="#2b6cb0" stroke="#ffffff" stroke-width="1.5"/>
        </svg>
      </div>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
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
  useEffect(() => {
    if (!activo || !navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPosicion([pos.coords.latitude, pos.coords.longitude])
        setPrecision(pos.coords.accuracy)
      },
      () => onError?.('No se pudo obtener tu ubicación'),
      { enableHighAccuracy: true, maximumAge: 5000 }
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
      circuloRef.current = L.circle(posicion, { radius: precision || 0, color: '#2b6cb0', weight: 1, fillOpacity: 0.08 }).addTo(map)
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

// src/pages/Mapa.jsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Spinner, Alert, Form, InputGroup, Button } from 'react-bootstrap'
import L from 'leaflet'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import 'leaflet/dist/leaflet.css'

// Fix de iconos de Leaflet con Vite (bug conocido)
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Íconos según estado del medidor
const iconos = {
  localizado: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  }),
  perdido: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  }),
  pendiente: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  }),
  revision: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  }),
}

// Componente auxiliar: centra el mapa en un medidor buscado
function CentrarMapa({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.setView(coords, 17)
  }, [coords, map])
  return null
}

export default function Mapa() {
  const { usuario, logout } = useAuth()
  const [medidores, setMedidores]   = useState([])
  const [cargando, setCargando]     = useState(true)
  const [error, setError]           = useState(null)
  const [busqueda, setBusqueda]     = useState('')
  const [centroMapa, setCentroMapa] = useState(null)

  const CENTRO_MAULE = [-35.5, -71.65]

  useEffect(() => {
    cargarMedidores()
  }, [])

  async function cargarMedidores() {
    try {
      const { data } = await api.get('/medidores?limite=301')
      setMedidores(data.medidores)
    } catch (err) {
      setError('Error al cargar los medidores')
    } finally {
      setCargando(false)
    }
  }

  async function handleBuscar(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    try {
      const { data } = await api.get(`/medidores/buscar?q=${busqueda}`)
      if (data.medidores.length > 0) {
        const m = data.medidores[0]
        if (m.ubicacion?.coordinates) {
          const [lng, lat] = m.ubicacion.coordinates
          setCentroMapa([lat, lng])
        }
      } else {
        alert('No se encontró ningún medidor con ese criterio')
      }
    } catch (err) {
      setError('Error al buscar')
    }
  }

  if (cargando) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
      <Spinner animation="border" variant="primary" />
      <span className="ms-3">Cargando medidores...</span>
    </div>
  )

  if (error) return <Alert variant="danger" className="m-3">{error}</Alert>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Navbar */}
      <nav className="navbar navbar-dark bg-primary px-3 py-2">
        <span className="navbar-brand mb-0">⚡ Medidores CGE — Zona Maule</span>
        <div className="d-flex align-items-center gap-3">
          <span className="text-white">👤 {usuario.nombre}</span>
          <button
            className="btn btn-outline-light btn-sm"
            onClick={logout}
          >
            Cerrar sesión
          </button>
        </div>
      </nav>

      {/* Contenedor del mapa */}
      <div style={{ position: 'relative', flex: 1 }}>

        {/* Barra de búsqueda flotante */}
        <div style={{
          position: 'absolute', top: '1rem', left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000, width: '90%', maxWidth: '400px',
        }}>
          <form onSubmit={handleBuscar}>
            <InputGroup>
              <Form.Control
                placeholder="Buscar por instalación, dirección o poste..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <Button type="submit" variant="primary">🔍</Button>
            </InputGroup>
          </form>
        </div>

        {/* Leyenda */}
        <div style={{
          position: 'absolute', bottom: '2rem', left: '1rem',
          zIndex: 1000, backgroundColor: 'white',
          padding: '0.75rem', borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: '0.8rem',
        }}>
          <div><span style={{ color: 'green' }}>●</span> Localizado</div>
          <div><span style={{ color: '#2196F3' }}>●</span> Pendiente</div>
          <div><span style={{ color: 'red' }}>●</span> Perdido</div>
          <div><span style={{ color: 'orange' }}>●</span> Revisión</div>
          <hr style={{ margin: '0.4rem 0' }} />
          <div><strong>{medidores.length}</strong> medidores</div>
        </div>

        {/* Mapa */}
        <MapContainer
          center={CENTRO_MAULE}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {centroMapa && <CentrarMapa coords={centroMapa} />}

          {medidores.map((m) => {
            if (!m.ubicacion?.coordinates) return null
            const [lng, lat] = m.ubicacion.coordinates
            const icono = iconos[m.estado] || iconos.pendiente

            return (
              <Marker key={m._id} position={[lat, lng]} icon={icono}>
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <h6 className="mb-1">📍 {m.instalacion}</h6>
                    <hr style={{ margin: '0.4rem 0' }} />
                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                      <strong>Estado:</strong> {m.estado}<br />
                      <strong>Dirección:</strong> {m.direccion || '—'}<br />
                      <strong>Poste:</strong> {m.numeroDePoste || '—'}<br />
                      <strong>Serie:</strong> {m.numeroDeSerie || '—'}<br />
                      <strong>Tarifa:</strong> {m.tarifa || '—'}<br />
                      <strong>Contratista:</strong> {m.contratista || '—'}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>

      </div>
    </div>
  )
}
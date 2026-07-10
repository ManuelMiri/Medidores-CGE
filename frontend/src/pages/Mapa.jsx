// src/pages/Mapa.jsx
import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Spinner, Alert, Form, InputGroup, Button, Modal } from 'react-bootstrap'
import L from 'leaflet'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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
  nuevo: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-violet.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
  }),
}

function CentrarMapa({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.setView(coords, 17)
  }, [coords, map])
  return null
}

function CapturarClick({ onClickMapa, modoAgregar }) {
  useMapEvents({
    click(e) {
      if (modoAgregar) onClickMapa([e.latlng.lat, e.latlng.lng])
    },
  })
  return null
}

// Formulario reutilizable — mismo para modal y panel lateral
function FormularioMedidor({ campos, setCampos, uls, nuevoPunto, medidorEdit, guardando, onGuardar, onCerrar }) {
  return (
    <>
      {nuevoPunto && (
        <div className="alert alert-success py-1 px-2 mb-2" style={{ fontSize: '0.78rem' }}>
          📍 Lat: {nuevoPunto[0].toFixed(5)}, Lng: {nuevoPunto[1].toFixed(5)}
        </div>
      )}

      {[
        ['instalacion', 'N° Instalación *'],
        ['zona', 'Zona'],
        ['establecimiento', 'Establecimiento'],
        ['proceso', 'Proceso'],
        ['direccion', 'Dirección'],
        ['numeroDePoste', 'N° Poste'],
        ['numeroDeSerie', 'N° Serie'],
        ['marca', 'Marca'],
      ].map(([key, label]) => (
        <div className="mb-2" key={key}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>{label}</label>
          <input
            className="form-control form-control-sm"
            value={campos[key]}
            onChange={e => setCampos(prev => ({ ...prev, [key]: e.target.value }))}
          />
        </div>
      ))}

      <div className="mb-2">
        <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>UL</label>
        <select className="form-select form-select-sm"
          value={campos.unidadDeLectura}
          onChange={e => setCampos(prev => ({ ...prev, unidadDeLectura: e.target.value }))}>
          <option value="">Seleccionar UL</option>
          {uls.map(ul => <option key={ul} value={ul}>{ul}</option>)}
        </select>
      </div>

      <div className="mb-2">
        <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Estado</label>
        <select className="form-select form-select-sm"
          value={campos.estado}
          onChange={e => setCampos(prev => ({ ...prev, estado: e.target.value }))}>
          <option value="pendiente">Pendiente</option>
          <option value="localizado">Localizado</option>
          <option value="perdido">Perdido</option>
          <option value="revision">Revisión</option>
        </select>
      </div>

      <div className="mb-3">
        <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>Observaciones</label>
        <textarea className="form-control form-control-sm" rows={2}
          value={campos.observaciones}
          onChange={e => setCampos(prev => ({ ...prev, observaciones: e.target.value }))}
        />
      </div>

      <button
        className="btn btn-primary w-100 btn-sm"
        onClick={onGuardar}
        disabled={guardando || !campos.instalacion}
      >
        {guardando
          ? <Spinner size="sm" />
          : medidorEdit ? '💾 Guardar cambios' : '➕ Agregar medidor'
        }
      </button>
    </>
  )
}

export default function Mapa() {
  const { usuario, logout } = useAuth()
  const [medidores, setMedidores]       = useState([])
  const [uls, setUls]                   = useState([])
  const [ulsActivas, setUlsActivas]     = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)
  const [busqueda, setBusqueda]         = useState('')
  const [centroMapa, setCentroMapa]     = useState(null)
  const [modoAgregar, setModoAgregar]   = useState(false)
  const [nuevoPunto, setNuevoPunto]     = useState(null)
  const [formulario, setFormulario]     = useState(false)
  const [medidorEdit, setMedidorEdit]   = useState(null)
  const [guardando, setGuardando]       = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)

  // Detectar si es móvil
  const esMobil = window.innerWidth < 768

  const [campos, setCampos] = useState({
    instalacion: '', zona: 'MAULE', establecimiento: '',
    proceso: '', direccion: '', numeroDePoste: '',
    numeroDeSerie: '', marca: '', unidadDeLectura: '',
    estado: 'pendiente', observaciones: '',
  })

  const CENTRO_MAULE = [-35.5, -71.65]

  useEffect(() => { cargarUls() }, [])
  useEffect(() => {
    if (ulsActivas.length > 0) cargarMedidores()
    else setMedidores([])
  }, [ulsActivas])

  async function cargarUls() {
    try {
      const { data } = await api.get('/medidores/uls')
      setUls(data.uls)
      if (data.uls.length > 0) setUlsActivas([data.uls[0]])
    } catch { setError('Error al cargar las unidades de lectura') }
    finally { setCargando(false) }
  }

  async function cargarMedidores() {
    try {
      setCargando(true)
      const promesas = ulsActivas.map(ul => api.get(`/medidores?ul=${ul}&limite=500`))
      const resultados = await Promise.all(promesas)
      const todos = resultados.flatMap(r => r.data.medidores)
      const unicos = Array.from(new Map(todos.map(m => [m._id, m])).values())
      setMedidores(unicos)
    } catch { setError('Error al cargar los medidores') }
    finally { setCargando(false) }
  }

  function toggleUl(ul) {
    setUlsActivas(prev =>
      prev.includes(ul) ? prev.filter(u => u !== ul) : [...prev, ul]
    )
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
      } else { alert('No se encontró ningún medidor') }
    } catch { setError('Error al buscar') }
  }

  function abrirFormulario(medidor = null, coords = null) {
    if (medidor) {
      setCampos({
        instalacion:     medidor.instalacion     || '',
        zona:            medidor.zona            || 'MAULE',
        establecimiento: medidor.establecimiento || '',
        proceso:         medidor.proceso         || '',
        direccion:       medidor.direccion       || '',
        numeroDePoste:   medidor.numeroDePoste   || '',
        numeroDeSerie:   medidor.numeroDeSerie   || '',
        marca:           medidor.marca           || '',
        unidadDeLectura: medidor.unidadDeLectura || '',
        estado:          medidor.estado          || 'pendiente',
        observaciones:   medidor.observaciones   || '',
      })
      setMedidorEdit(medidor)
      setNuevoPunto(null)
    } else {
      setCampos({
        instalacion: '', zona: 'MAULE', establecimiento: '',
        proceso: '', direccion: '', numeroDePoste: '',
        numeroDeSerie: '', marca: '', unidadDeLectura: ulsActivas[0] || '',
        estado: 'pendiente', observaciones: '',
      })
      setMedidorEdit(null)
      setNuevoPunto(coords)
    }
    setModoAgregar(false)
    setFormulario(true)
    // En móvil ocultamos el panel lateral para dar más espacio
    if (esMobil) setPanelVisible(false)
  }

  function cerrarFormulario() {
    setFormulario(false)
    setNuevoPunto(null)
    setMedidorEdit(null)
    if (esMobil) setPanelVisible(true)
  }

  async function handleGuardar() {
    setGuardando(true)
    try {
      if (medidorEdit) {
        await api.patch(`/medidores/${medidorEdit.instalacion}`, campos)
      } else {
        const [lat, lng_] = nuevoPunto
        await api.post('/medidores', {
          ...campos,
          proceso: campos.proceso ? parseInt(campos.proceso) : null,
          ubicacion: { type: 'Point', coordinates: [lng_, lat] },
        })
      }
      cerrarFormulario()
      await cargarMedidores()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar')
    } finally { setGuardando(false) }
  }

  async function handleEliminar(instalacion) {
    if (!confirm(`¿Eliminar el medidor ${instalacion}?`)) return
    try {
      await api.delete(`/medidores/${instalacion}`)
      await cargarMedidores()
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar') }
  }

  if (cargando && uls.length === 0) return (
    <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
      <Spinner animation="border" variant="primary" />
      <span className="ms-3">Cargando sistema...</span>
    </div>
  )

  if (error) return <Alert variant="danger" className="m-3">{error}</Alert>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

      {/* Navbar */}
      <nav className="navbar navbar-dark bg-primary px-3 py-2">
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-outline-light btn-sm"
            onClick={() => setPanelVisible(!panelVisible)}>
            {panelVisible ? '◀' : '▶'}
          </button>
          <span className="navbar-brand mb-0">⚡ CGE Maule</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="text-white small d-none d-md-block">
            👤 {usuario.nombre} · {usuario.rol}
          </span>
          <button className="btn btn-outline-light btn-sm" onClick={logout}>Salir</button>
        </div>
      </nav>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Panel lateral izquierdo */}
        {panelVisible && (
          <div style={{
            width: '250px', minWidth: '250px',
            backgroundColor: '#fff',
            borderRight: '1px solid #e2e8f0',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto', zIndex: 100,
          }}>
            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2b6cb0', margin: '0 0 0.5rem' }}>
                📋 Unidades de Lectura
              </p>
              {uls.map(ul => (
                <div key={ul} className="form-check mb-1">
                  <input className="form-check-input" type="checkbox"
                    id={`ul-${ul}`} checked={ulsActivas.includes(ul)}
                    onChange={() => toggleUl(ul)} />
                  <label className="form-check-label" htmlFor={`ul-${ul}`}
                    style={{ fontSize: '0.85rem', cursor: 'pointer' }}>{ul}</label>
                </div>
              ))}
            </div>

            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2b6cb0', margin: '0 0 0.5rem' }}>
                📊 Resumen
              </p>
              <div style={{ fontSize: '0.82rem' }}>
                <div>Total: <strong>{medidores.length}</strong></div>
                <div style={{ color: 'green' }}>✅ Localizados: <strong>{medidores.filter(m => m.estado === 'localizado').length}</strong></div>
                <div style={{ color: '#2196F3' }}>🔵 Pendientes: <strong>{medidores.filter(m => m.estado === 'pendiente').length}</strong></div>
                <div style={{ color: 'red' }}>❌ Perdidos: <strong>{medidores.filter(m => m.estado === 'perdido').length}</strong></div>
                <div style={{ color: 'orange' }}>⚠️ Revisión: <strong>{medidores.filter(m => m.estado === 'revision').length}</strong></div>
              </div>
            </div>

            <div style={{ padding: '0.75rem' }}>
              <button
                className={`btn btn-sm w-100 ${modoAgregar ? 'btn-danger' : 'btn-success'}`}
                onClick={() => setModoAgregar(!modoAgregar)}>
                {modoAgregar ? '❌ Cancelar' : '📍 Agregar medidor'}
              </button>
              {modoAgregar && (
                <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.4rem', textAlign: 'center' }}>
                  Toca el mapa para colocar el punto
                </p>
              )}
            </div>
          </div>
        )}

        {/* Mapa */}
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{
            position: 'absolute', top: '0.75rem', left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000, width: '90%', maxWidth: '380px',
          }}>
            <form onSubmit={handleBuscar}>
              <InputGroup size="sm">
                <Form.Control
                  placeholder="Buscar instalación, dirección o poste..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
                <Button type="submit" variant="primary">🔍</Button>
              </InputGroup>
            </form>
          </div>

          {modoAgregar && (
            <div style={{
              position: 'absolute', top: '3.5rem', left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000, backgroundColor: '#276749',
              color: 'white', padding: '0.3rem 0.8rem',
              borderRadius: '20px', fontSize: '0.8rem',
            }}>
              📍 Toca el mapa para agregar un punto
            </div>
          )}

          {cargando && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 1000, backgroundColor: 'white',
              padding: '0.75rem 1rem', borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}>
              <Spinner animation="border" size="sm" /> Cargando...
            </div>
          )}

          <MapContainer center={CENTRO_MAULE} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {centroMapa && <CentrarMapa coords={centroMapa} />}
            <CapturarClick
              onClickMapa={(coords) => abrirFormulario(null, coords)}
              modoAgregar={modoAgregar}
            />

            {nuevoPunto && (
              <Marker position={nuevoPunto} icon={iconos.nuevo}>
                <Popup>Nuevo medidor aquí</Popup>
              </Marker>
            )}

            {medidores.map(m => {
              if (!m.ubicacion?.coordinates) return null
              const [lng, lat] = m.ubicacion.coordinates
              const icono = iconos[m.estado] || iconos.pendiente
              return (
                <Marker key={m._id} position={[lat, lng]} icon={icono}>
                  <Popup minWidth={200}>
                    <div>
                      <h6 style={{ fontSize: '0.9rem' }} className="mb-1">📍 {m.instalacion}</h6>
                      <hr style={{ margin: '0.3rem 0' }} />
                      <p style={{ margin: 0, fontSize: '0.8rem' }}>
                        <strong>Estado:</strong> {m.estado}<br />
                        <strong>Dirección:</strong> {m.direccion || '—'}<br />
                        <strong>Poste:</strong> {m.numeroDePoste || '—'}<br />
                        <strong>Serie:</strong> {m.numeroDeSerie || '—'}<br />
                        {(usuario.rol === 'admin' || usuario.rol === 'supervisor') && (
                          <><strong>UL:</strong> {m.unidadDeLectura || '—'}<br /></>
                        )}
                        {m.observaciones && <><strong>Obs:</strong> {m.observaciones}<br /></>}
                      </p>
                      <div className="d-flex gap-1 mt-2">
                        <button className="btn btn-primary btn-sm"
                          onClick={() => abrirFormulario(m)}>✏️ Editar</button>
                        {usuario.rol === 'admin' && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => handleEliminar(m.instalacion)}>🗑️</button>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>

        {/* Panel lateral derecho en ESCRITORIO */}
        {formulario && !esMobil && (
          <div style={{
            width: '280px', minWidth: '280px',
            backgroundColor: '#fff',
            borderLeft: '1px solid #e2e8f0',
            padding: '0.75rem', overflowY: 'auto',
          }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 className="mb-0" style={{ fontSize: '0.9rem' }}>
                {medidorEdit ? '✏️ Editar medidor' : '➕ Nuevo medidor'}
              </h6>
              <button className="btn btn-sm btn-outline-secondary" onClick={cerrarFormulario}>✕</button>
            </div>
            <FormularioMedidor
              campos={campos} setCampos={setCampos} uls={uls}
              nuevoPunto={nuevoPunto} medidorEdit={medidorEdit}
              guardando={guardando} onGuardar={handleGuardar} onCerrar={cerrarFormulario}
            />
          </div>
        )}
      </div>

      {/* MODAL en MÓVIL — aparece encima de todo */}
      <Modal show={formulario && esMobil} onHide={cerrarFormulario} fullscreen="sm-down">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>
            {medidorEdit ? '✏️ Editar medidor' : '➕ Nuevo medidor'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormularioMedidor
            campos={campos} setCampos={setCampos} uls={uls}
            nuevoPunto={nuevoPunto} medidorEdit={medidorEdit}
            guardando={guardando} onGuardar={handleGuardar} onCerrar={cerrarFormulario}
          />
        </Modal.Body>
      </Modal>
    </div>
  )
}
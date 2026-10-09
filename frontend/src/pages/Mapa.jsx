// src/pages/Mapa.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, LayersControl, LayerGroup, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Spinner, Alert, Form, InputGroup, Button, Modal } from 'react-bootstrap'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import CargaKml from '../components/CargaKml'
import CapturaFoto from '../components/CapturaFoto'
import GestionUsuarios from '../components/GestionUsuarios'
import MiUbicacion from '../components/MiUbicacion'
import PanelToes from '../components/PanelToes'
import CapaMedidores from '../components/CapaMedidores'
import { useToes } from '../hooks/useToes'
import { vistaDeGrupo } from '../utils/vistaMarcador'
import { iconos } from '../utils/iconosMapa'
import { agruparCercanos } from '../utils/agrupar'
import 'leaflet/dist/leaflet.css'

// Leaflet mide el tamaño de su contenedor UNA vez al montar, y si después
// ese contenedor cambia de tamaño (se muestra/oculta el panel lateral,
// rotas el celular, o el navegador esconde/muestra la barra de
// direcciones al hacer scroll — algo que pasa todo el tiempo en Android)
// Leaflet no se entera solo. Sigue dibujando tiles para el tamaño viejo,
// y el resto del contenedor queda completamente vacío. Este componente le
// avisa "recalcula tu tamaño" cada vez que el div del mapa cambia.
function InvalidarTamano() {
  const map = useMap()

  useEffect(() => {
    const contenedor = map.getContainer()

    function recalcular() {
      map.invalidateSize()
    }

    // Recalcula apenas monta (a veces el contenedor no tiene su tamaño
    // final todavía en el primer render) y cada vez que cambia de tamaño.
    const t = setTimeout(recalcular, 200)

    const observer = new ResizeObserver(recalcular)
    observer.observe(contenedor)

    // orientationchange cubre el caso de rotar el celular, que a veces
    // el ResizeObserver detecta con un poco de retraso.
    window.addEventListener('orientationchange', recalcular)

    return () => {
      clearTimeout(t)
      observer.disconnect()
      window.removeEventListener('orientationchange', recalcular)
    }
  }, [map])

  return null
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
function FormularioMedidor({ campos, setCampos, uls, nuevoPunto, medidorEdit, guardando, onGuardar, onCerrar, onFotoSubida }) {
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

      {/* Las fotos se suben directo contra el medidor ya guardado, así
          que solo tienen sentido cuando estamos editando uno existente. */}
      {medidorEdit && (
        <CapturaFoto
          instalacion={medidorEdit.instalacion}
          fotosExistentes={medidorEdit.fotos}
          onFotoSubida={onFotoSubida}
        />
      )}
    </>
  )
}

// Guardo la última capa elegida (calles/satélite) para que al volver a
// abrir la app no haya que cambiarla de nuevo cada vez
const CLAVE_CAPA = 'capaMapa'
function leerCapaGuardada() {
  try { return localStorage.getItem(CLAVE_CAPA) || 'calles' } catch { return 'calles' }
}
const capaInicial = leerCapaGuardada()

function RecordarCapa() {
  useMapEvents({
    baselayerchange: (e) => {
      try { localStorage.setItem(CLAVE_CAPA, e.name === 'Satélite' ? 'satelite' : 'calles') } catch { /* sin storage, da igual */ }
    },
  })
  return null
}

export default function Mapa() {
  const { usuario, logout } = useAuth()
  const [medidores, setMedidores]       = useState([])
  const [uls, setUls]                   = useState([])
  const [ulsActivas, setUlsActivas]     = useState([])
  const [cargando, setCargando]         = useState(true)
  const [error, setError]               = useState(null)
  const [busqueda, setBusqueda]         = useState('')
  const [filtroUl, setFiltroUl]         = useState('')
  const [miUbicacionActiva, setMiUbicacionActiva] = useState(false)
  const [centroMapa, setCentroMapa]     = useState(null)
  // _id del medidor seleccionado (tocado o encontrado con el buscador),
  // para pintarlo dorado hasta que toques o busques otro
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  // grupo (pin con número) que tocaste y todavía no eliges cuál medidor es;
  // también se pinta dorado para que sepas qué punto tocaste
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null)

  // selecciono un medidor y suelto el grupo que hubiera tocado antes.
  // Los callbacks que recibe CapaMedidores van con useCallback porque sus
  // marcadores están memoizados: un callback nuevo en cada render haría que
  // los ~300 pines se re-renderizaran igual y el memo no serviría de nada.
  const seleccionarMedidor = useCallback((id) => {
    setGrupoSeleccionado(null)
    setSeleccionadoId(id)
  }, [])

  const elegirGrupo = useCallback((idGrupo) => {
    setSeleccionadoId(null)
    setGrupoSeleccionado(idGrupo)
  }, [])
  const [modoAgregar, setModoAgregar]   = useState(false)
  const [nuevoPunto, setNuevoPunto]     = useState(null)
  const [formulario, setFormulario]     = useState(false)
  const [medidorEdit, setMedidorEdit]   = useState(null)
  const [guardando, setGuardando]       = useState(false)
  const [panelVisible, setPanelVisible] = useState(true)

  // Lecturas ya tomadas en TOES. Todo el estado vive en el teléfono:
  // el log tiene datos de clientes y no se sube a ningún servidor.
  const toes = useToes(ulsActivas)

  // Detectar si es móvil
  const esMobil = window.innerWidth < 768

  // Junto los medidores que están prácticamente en el mismo punto (mismo
  // poste o misma casa) en un solo pin con contador, porque si no quedan
  // uno encima de otro y no hay forma de tocar los de abajo
  const grupos = useMemo(() => agruparCercanos(medidores, 5), [medidores])

  // Capa TOES: para cada grupo, qué servicios quedan por visitar, con qué
  // icono y opacidad. Saca del pin lo que el lector ya tomó en el ciclo
  // vigente; si no queda ninguno, el pin no se dibuja. Nunca se borra nada:
  // solo cambia la visibilidad.
  //
  // Memoizado para que los objetos `vista` mantengan su identidad entre
  // renders. Si se calcularan dentro del render de la lista, cada uno sería
  // un objeto nuevo y rompería el memo de los marcadores.
  const vistas = useMemo(
    () => grupos.map((g) => vistaDeGrupo(
      g.medidores, toes.indice, toes.config, iconos, toes.verTomados, seleccionadoId
    )),
    [grupos, toes.indice, toes.config, toes.verTomados, seleccionadoId]
  )

  const [campos, setCampos] = useState({
    instalacion: '', zona: 'MAULE', establecimiento: '',
    proceso: '', direccion: '', numeroDePoste: '',
    numeroDeSerie: '', marca: '', unidadDeLectura: '',
    estado: 'pendiente', observaciones: '',
  })

  const CENTRO_MAULE = [-35.5, -71.65]

  // OJO con el orden: estas dos van ANTES de los useEffect que las usan.
  // `cargarMedidores` es un const, y un const no se hoistea como una function:
  // si queda debajo, el array de dependencias del efecto — que se evalúa
  // durante el render — lo lee antes de que exista y tira
  // "Cannot access 'cargarMedidores' before initialization". Eso revienta el
  // render de Mapa, React desmonta el árbol y la app queda en blanco.
  async function cargarUls() {
    try {
      const { data } = await api.get('/medidores/uls')
      setUls(data.uls)
      if (data.uls.length > 0) setUlsActivas([data.uls[0]])
    } catch { setError('Error al cargar las unidades de lectura') }
    finally { setCargando(false) }
  }

  const cargarMedidores = useCallback(async () => {
    try {
      setCargando(true)
      const promesas = ulsActivas.map(ul => api.get(`/medidores?ul=${ul}&limite=500`))
      const resultados = await Promise.all(promesas)
      const todos = resultados.flatMap(r => r.data.medidores)
      const unicos = Array.from(new Map(todos.map(m => [m._id, m])).values())
      setMedidores(unicos)
    } catch { setError('Error al cargar los medidores') }
    finally { setCargando(false) }
  }, [ulsActivas])

  useEffect(() => { cargarUls() }, [])
  useEffect(() => {
    if (ulsActivas.length > 0) cargarMedidores()
    else setMedidores([])
    // cargarMedidores ya es estable (useCallback sobre [ulsActivas]), así que
    // declararlo no agrega vueltas: cambia exactamente cuando cambia ulsActivas.
  }, [ulsActivas, cargarMedidores])

  function toggleUl(ul) {
    setUlsActivas(prev =>
      prev.includes(ul) ? prev.filter(u => u !== ul) : [...prev, ul]
    )
  }

  async function handleBuscar(e) {
    e.preventDefault()
    const texto = busqueda.trim()
    if (!texto) return

    // Si es puro número (los últimos 4-5 dígitos del medidor), busco
    // primero dentro de lo que ya está cargado (o sea, dentro de las ULs
    // que tienes marcadas) comparando el FINAL del número de instalación
    // — así "1234" encuentra el medidor 103382314 sin ambigüedad con
    // otros números que solo lo contengan en el medio.
    if (/^\d+$/.test(texto) && ulsActivas.length > 0) {
      const candidatos = medidores.filter((m) => m.instalacion?.endsWith(texto))

      if (candidatos.length === 1) {
        const [lng, lat] = candidatos[0].ubicacion?.coordinates || []
        if (lat && lng) setCentroMapa([lat, lng])
        seleccionarMedidor(candidatos[0]._id)
        return
      }
      if (candidatos.length > 1) {
        alert(`Hay ${candidatos.length} medidores que terminan en "${texto}" en las ULs marcadas. Escribe más dígitos para precisar.`)
        return
      }
      // Si no hay ninguno en las ULs activas, sigo abajo con la búsqueda
      // general por si el medidor está en otra UL que no tienes marcada.
    }

    try {
      const { data } = await api.get(`/medidores/buscar?q=${texto}`)
      if (data.medidores.length > 0) {
        const m = data.medidores[0]
        if (m.ubicacion?.coordinates) {
          const [lng, lat] = m.ubicacion.coordinates
          setCentroMapa([lat, lng])
        }
        seleccionarMedidor(m._id)
        // Si el medidor es de una UL que no tienes marcada, la marco yo,
        // porque si no su pin no está cargado y no hay nada que resaltar
        if (m.unidadDeLectura && !ulsActivas.includes(m.unidadDeLectura)) {
          setUlsActivas((prev) => [...prev, m.unidadDeLectura])
        }
      } else { alert('No se encontró ningún medidor') }
    } catch { setError('Error al buscar') }
  }

  const abrirFormulario = useCallback((medidor = null, coords = null) => {
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
  }, [ulsActivas, esMobil])

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

  const handleEliminar = useCallback(async (instalacion) => {
    if (!confirm(`¿Eliminar el medidor ${instalacion}?`)) return
    try {
      await api.delete(`/medidores/${instalacion}`)
      await cargarMedidores()
    } catch (err) { alert(err.response?.data?.error || 'Error al eliminar') }
  }, [cargarMedidores])

  // El backend devuelve el medidor ya actualizado (con la foto nueva
  // adentro), así que solo actualizamos el estado local con eso — no hace
  // falta otro fetch aparte para refrescar el panel de fotos.
  function handleFotoSubida(medidorActualizado) {
    setMedidorEdit(medidorActualizado)
    cargarMedidores()
  }

  async function handleExportarRuta(ul) {
    try {
      // responseType 'blob' porque es un archivo binario (.xlsx), no JSON.
      // No puedo simplemente abrir la URL en una pestaña nueva porque el
      // endpoint requiere el token de auth en el header.
      const res = await api.get(`/rutas/${ul}/exportar`, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = `${ul}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert('Error al exportar la ruta')
    }
  }

  async function handleEliminarRuta(ul) {
    if (!confirm(`¿Eliminar TODOS los medidores de la ruta ${ul}? Esta acción no se puede deshacer.`)) return
    try {
      const { data } = await api.delete(`/rutas/${ul}`)
      alert(`Se eliminaron ${data.totalEliminados} medidores de la ruta ${ul}`)
      await cargarMedidores()
      await cargarUls()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar la ruta')
    }
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
          {usuario.rol === 'admin' && <GestionUsuarios />}
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

              {/* Con 200+ rutas, la lista completa de checkboxes se hace
                  eterna. Este filtro corta la lista visible al toque, y el
                  contenedor de abajo tiene una altura tope con scroll para
                  que nunca vuelva a crecer indefinidamente. */}
              <input
                type="text"
                className="form-control form-control-sm mb-2"
                placeholder="Filtrar UL..."
                value={filtroUl}
                onChange={(e) => setFiltroUl(e.target.value)}
              />

              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                {uls
                  .filter((ul) => ul.toLowerCase().includes(filtroUl.toLowerCase()))
                  .map(ul => (
                    <div key={ul} className="d-flex align-items-center justify-content-between mb-1">
                      <div className="form-check" style={{ flex: 1, minWidth: 0 }}>
                        <input className="form-check-input" type="checkbox"
                          id={`ul-${ul}`} checked={ulsActivas.includes(ul)}
                          onChange={() => toggleUl(ul)} />
                        <label className="form-check-label text-truncate d-block" htmlFor={`ul-${ul}`}
                          style={{ fontSize: '0.85rem', cursor: 'pointer' }}>{ul}</label>
                      </div>
                      {/* Exportar la deja ver admin y supervisor; eliminar
                          la ruta completa es una acción destructiva, solo
                          para admin. */}
                      {(usuario.rol === 'admin' || usuario.rol === 'supervisor') && (
                        <button className="btn btn-sm p-0 px-1" title="Exportar ruta (formato SAP)"
                          onClick={() => handleExportarRuta(ul)} style={{ fontSize: '0.85rem' }}>
                          📥
                        </button>
                      )}
                      {usuario.rol === 'admin' && (
                        <button className="btn btn-sm p-0 px-1" title="Eliminar ruta completa"
                          onClick={() => handleEliminarRuta(ul)} style={{ fontSize: '0.85rem' }}>
                          🗑️
                        </button>
                      )}
                    </div>
                  ))
                }
                {filtroUl && uls.filter((ul) => ul.toLowerCase().includes(filtroUl.toLowerCase())).length === 0 && (
                  <p className="text-muted" style={{ fontSize: '0.78rem' }}>Sin resultados</p>
                )}
              </div>
            </div>

            <PanelToes toes={toes} medidores={medidores} ulsActivas={ulsActivas} />

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
                className={`btn btn-sm w-100 ${miUbicacionActiva ? 'btn-primary' : 'btn-outline-primary'}`}
                onClick={() => setMiUbicacionActiva((a) => !a)}>
                {miUbicacionActiva ? '📍 Ocultar mi ubicación' : '📍 Mostrar mi ubicación'}
              </button>

              <button
                className={`btn btn-sm w-100 mt-2 ${modoAgregar ? 'btn-danger' : 'btn-success'}`}
                onClick={() => setModoAgregar(!modoAgregar)}>
                {modoAgregar ? '❌ Cancelar' : '📍 Agregar medidor'}
              </button>
              {modoAgregar && (
                <p style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.4rem', textAlign: 'center' }}>
                  Toca el mapa para colocar el punto
                </p>
              )}

              {usuario.rol === 'admin' && (
                <div className="mt-2">
                  <CargaKml onImportado={() => { cargarUls(); cargarMedidores() }} />
                </div>
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
                  placeholder="Últimos dígitos del medidor, dirección o poste..."
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

          {/* Zoom máximo 18: es hasta donde Esri tiene foto real en la zona.
              Si dejaba acercar más, en el teléfono aparecían cuadrados grises.
              Con el pin no se pierde precisión: queda en la coordenada exacta
              donde tocas, da igual el zoom. */}
          <MapContainer
            center={CENTRO_MAULE} zoom={13} maxZoom={18}
            style={{ height: '100%', width: '100%' }}
            // Acá estuvo markerZoomAnimation={false} y se quitó a propósito.
            // Ahorra el handler de `zoomanim` por marcador, que con 300 pines
            // pesaba, pero Leaflet lo implementa poniéndole `leaflet-zoom-hide`
            // al panel: los pines se OCULTAN durante toda la animación y
            // reaparecen de golpe. Eso se lee como una falla, no como fluidez.
            // El culling de CapaMedidores ataca lo mismo sin ese costo: con
            // ~10-40 pines en pantalla en vez de 300, el handler ya no importa.
          >
            {/* Selector de capas (arriba a la derecha): calles o satélite.
                La satelital es de Esri, sirve para ver las casas y ubicar
                el medidor mejor en terreno. No pide API key. */}
            <LayersControl position="topright">
              <LayersControl.BaseLayer name="Calles" checked={capaInicial !== 'satelite'}>
                <TileLayer
                  // Antes usaba CARTO, pero ahora sus tiles piden API key y el mapa
                  // salía todo con "API KEY REQUIRED". Me cambié a los tiles de
                  // OpenStreetMap directo, que no piden key (para el uso que le
                  // damos, un equipo chico, está dentro de su política).
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  // todas las capas con techo 18 (ver comentario del MapContainer)
                  maxZoom={18}
                  // updateWhenIdle: con señal mala, pedir tiles nuevos en cada
                  // pixel que arrastras satura la conexión y todo se siente
                  // más lento. Con esto, solo pide tiles nuevos cuando sueltas
                  // el mapa (terminaste de moverlo), no mientras lo arrastras.
                  updateWhenIdle={true}
                  crossOrigin="anonymous"
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Satélite" checked={capaInicial === 'satelite'}>
                {/* La foto sola no tiene nombres de calles, así que encima le
                    pongo la capa de referencia de Esri (caminos y sus nombres)
                    para no perderse en sectores rurales.

                    Acá había también World_Boundaries_and_Places (nombres de
                    localidades y límites) y se quitó. Midiendo el caché de
                    tiles del teléfono, cada capa de referencia pesaba lo mismo
                    que la foto: de 1.093 tiles cacheados, 313 eran de esa capa
                    sola — un 29% del tráfico del mapa. En el Maule rural los
                    caminos ya ubican, y sus nombres salen en la capa que
                    queda. */}
                <LayerGroup>
                  {/* Probé con medidores reales de las 6 ULs: Esri tiene foto
                      real hasta z18 en toda la zona, y en z19 devuelve el
                      cuadro gris ("Map data not yet available"). Por eso el
                      mapa completo no deja pasar de z18.

                      Por si algún sector raro no tiene ni z18, dejo dos capas:
                      1) Abajo, la foto hasta z15, que existe en todo Chile.
                      2) Arriba, la foto buena. Con blankTile=false, donde no
                         hay foto Esri debería mandar error en vez del gris,
                         y ahí se ve la de abajo. */}
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxNativeZoom={15}
                    maxZoom={18}
                    updateWhenIdle={true}
                    crossOrigin="anonymous"
                  />
                  <TileLayer
                    attribution='Imágenes &copy; Esri, Maxar, Earthstar Geographics'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false"
                    maxZoom={18}
                    updateWhenIdle={true}
                    crossOrigin="anonymous"
                  />
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={18}
                    updateWhenIdle={true}
                    crossOrigin="anonymous"
                  />
                </LayerGroup>
              </LayersControl.BaseLayer>
            </LayersControl>
            <RecordarCapa />
            {centroMapa && <CentrarMapa coords={centroMapa} />}
            <InvalidarTamano />
            <CapturarClick
              onClickMapa={(coords) => abrirFormulario(null, coords)}
              modoAgregar={modoAgregar}
            />
            <MiUbicacion
              activo={miUbicacionActiva}
              onError={(msg) => { alert(msg); setMiUbicacionActiva(false) }}
            />
            {nuevoPunto && (
              <Marker position={nuevoPunto} icon={iconos.nuevo}>
                <Popup>Nuevo medidor aquí</Popup>
              </Marker>
            )}

            {/* Los pines. Toda la lógica de qué se dibuja y qué muestra cada
                popup vive en CapaMedidores: ahí los marcadores están
                memoizados y solo se dibujan los del cuadro visible, que es lo
                que hace que arrastrar y hacer zoom con 300 pines no se trabe. */}
            <CapaMedidores
              grupos={grupos}
              vistas={vistas}
              seleccionadoId={seleccionadoId}
              grupoSeleccionado={grupoSeleccionado}
              esMobil={esMobil}
              rolUsuario={usuario.rol}
              toesConfig={toes.config}
              onElegir={seleccionarMedidor}
              onElegirGrupo={elegirGrupo}
              onEditar={abrirFormulario}
              onEliminar={handleEliminar}
              onFotoSubida={cargarMedidores}
            />
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
              onFotoSubida={handleFotoSubida}
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
            onFotoSubida={handleFotoSubida}
          />
        </Modal.Body>
      </Modal>
    </div>
  )
}
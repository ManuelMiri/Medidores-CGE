// src/components/GestionUsuarios.jsx
// Botón + modal para que el admin administre las cuentas: ver todas,
// cambiarles el rol, activar/desactivar, y crear cuentas nuevas. Antes
// esto se hacía a mano contra la API (con Thunder Client) porque
// /api/auth/registro estaba abierto; ahora que quedó protegida, esta es
// la única forma de crear usuarios desde la app.
import { useState } from 'react'
import { Modal, Spinner } from 'react-bootstrap'
import api from '../services/api'

const ROLES = ['lector', 'supervisor', 'admin']

function FormularioNuevoUsuario({ onCreado }) {
  const vacio = { nombre: '', email: '', password: '', rol: 'lector', zona: 'MAULE', unidadesLectura: '' }
  const [campos, setCampos] = useState(vacio)
  const [creando, setCreando] = useState(false)
  const [error, setError] = useState(null)

  async function handleCrear(e) {
    e.preventDefault()
    setCreando(true)
    setError(null)
    try {
      await api.post('/auth/registro', {
        ...campos,
        // El campo lo escribimos como texto separado por comas en el
        // formulario, pero el backend espera un array.
        unidadesLectura: campos.unidadesLectura
          .split(',')
          .map((ul) => ul.trim())
          .filter(Boolean),
      })
      setCampos(vacio)
      onCreado()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear el usuario')
    } finally {
      setCreando(false)
    }
  }

  return (
    <form onSubmit={handleCrear} className="border rounded p-2 mb-3">
      <p style={{ fontSize: '0.85rem', fontWeight: 600 }} className="mb-2">➕ Nuevo usuario</p>
      {error && <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: '0.78rem' }}>{error}</div>}

      <div className="row g-2">
        <div className="col-6">
          <input required className="form-control form-control-sm" placeholder="Nombre"
            value={campos.nombre} onChange={(e) => setCampos((p) => ({ ...p, nombre: e.target.value }))} />
        </div>
        <div className="col-6">
          <input required type="email" className="form-control form-control-sm" placeholder="Email"
            value={campos.email} onChange={(e) => setCampos((p) => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="col-6">
          <input required type="password" minLength={6} className="form-control form-control-sm" placeholder="Contraseña"
            value={campos.password} onChange={(e) => setCampos((p) => ({ ...p, password: e.target.value }))} />
        </div>
        <div className="col-6">
          <select className="form-select form-select-sm" value={campos.rol}
            onChange={(e) => setCampos((p) => ({ ...p, rol: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {campos.rol === 'lector' && (
          <div className="col-12">
            <input className="form-control form-control-sm" placeholder="ULs asignadas, separadas por coma (ej: E3559701, E3510021)"
              value={campos.unidadesLectura} onChange={(e) => setCampos((p) => ({ ...p, unidadesLectura: e.target.value }))} />
          </div>
        )}
      </div>

      <button className="btn btn-success btn-sm w-100 mt-2" disabled={creando}>
        {creando ? <Spinner size="sm" /> : 'Crear usuario'}
      </button>
    </form>
  )
}

export default function GestionUsuarios() {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)

  async function cargarUsuarios() {
    setCargando(true)
    setError(null)
    try {
      const { data } = await api.get('/auth/usuarios')
      setUsuarios(data.usuarios)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar usuarios')
    } finally {
      setCargando(false)
    }
  }

  function abrir() {
    setModalAbierto(true)
    cargarUsuarios()
  }

  async function cambiarRol(id, rol) {
    try {
      await api.patch(`/auth/usuarios/${id}/rol`, { rol })
      cargarUsuarios()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar el rol')
    }
  }

  async function cambiarEstado(id, activo) {
    try {
      await api.patch(`/auth/usuarios/${id}/estado`, { activo })
      cargarUsuarios()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar el estado')
    }
  }

  async function eliminarUsuario(id, nombre) {
    if (!confirm(`¿Eliminar la cuenta de ${nombre}? Esta acción no se puede deshacer.`)) return
    try {
      await api.delete(`/auth/usuarios/${id}`)
      cargarUsuarios()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar el usuario')
    }
  }

  return (
    <>
      <button className="btn btn-outline-light btn-sm" onClick={abrir}>👥 Usuarios</button>

      <Modal show={modalAbierto} onHide={() => setModalAbierto(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Gestión de usuarios</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <FormularioNuevoUsuario onCreado={cargarUsuarios} />

          {error && <div className="alert alert-danger py-2" style={{ fontSize: '0.85rem' }}>{error}</div>}

          {cargando ? (
            <div className="text-center py-3"><Spinner size="sm" /> Cargando…</div>
          ) : (
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table className="table table-sm" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u._id}>
                      <td>{u.nombre}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={u.rol}
                          onChange={(e) => cambiarRol(u._id, e.target.value)}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm ${u.activo ? 'btn-outline-success' : 'btn-outline-danger'}`}
                          onClick={() => cambiarEstado(u._id, !u.activo)}
                        >
                          {u.activo ? '✅ Activo' : '⛔ Inactivo'}
                        </button>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          title="Eliminar cuenta"
                          onClick={() => eliminarUsuario(u._id, u.nombre)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </>
  )
}
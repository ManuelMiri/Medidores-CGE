// src/components/NotasUl.jsx
// Las notas de una UL dentro del panel lateral: lo que el que vuelve a la
// ruta tiene que saber antes de llegar (la clave de un portón, un perro
// bravo). Las ve y agrega cualquiera con la UL; editar u ocultar es del
// autor o de un admin/supervisor. Ocultar no borra (ver models/NotaUl.js).
import { useState } from 'react'

function fechaCorta(f) {
  const d = f ? new Date(f) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

function Nota({ nota, puedeCambiar, onGuardar, onOcultar }) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(nota.texto)
  const [error, setError] = useState(null)

  async function guardar() {
    try {
      await onGuardar(texto)
      setEditando(false)
      setError(null)
    } catch (err) {
      setError(err?.response?.data?.error ?? 'Sin señal: no se pudo guardar')
    }
  }

  return (
    <div style={{
      background: '#fffbea', border: '1px solid #f6e05e', borderRadius: 6,
      padding: '0.35rem 0.5rem', marginBottom: '0.35rem', fontSize: '0.8rem',
    }}>
      {editando ? (
        <>
          <textarea className="form-control form-control-sm mb-1" rows={3}
            value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} />
          <div className="d-flex gap-1">
            <button className="btn btn-primary btn-sm py-0" onClick={guardar}
              disabled={!texto.trim()}>Guardar</button>
            <button className="btn btn-link btn-sm py-0"
              onClick={() => { setEditando(false); setTexto(nota.texto); setError(null) }}>cancelar</button>
          </div>
        </>
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{nota.texto}</div>
      )}
      {error && <div style={{ color: '#c53030', fontSize: '0.72rem' }}>{error}</div>}
      <div className="d-flex justify-content-between align-items-center"
        style={{ fontSize: '0.68rem', color: '#718096', marginTop: '0.15rem' }}>
        <span>{nota.autorNombre ?? ''} · {fechaCorta(nota.updatedAt ?? nota.createdAt)}</span>
        {puedeCambiar && !editando && (
          <span>
            <button className="btn btn-link btn-sm p-0 me-2" style={{ fontSize: '0.68rem' }}
              onClick={() => setEditando(true)}>editar</button>
            <button className="btn btn-link btn-sm p-0" style={{ fontSize: '0.68rem' }}
              onClick={onOcultar}>ocultar</button>
          </span>
        )}
      </div>
    </div>
  )
}

export default function NotasUl({ ul, datos, usuario, onAgregar, onCambiar }) {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const notas = datos?.notas ?? []
  const decide = usuario?.rol === 'admin' || usuario?.rol === 'supervisor'

  async function agregar() {
    if (!texto.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await onAgregar(ul, texto.trim())
      setTexto('')
    } catch (err) {
      // El texto se queda en la caja: sin señal no se pierde lo escrito.
      setError(err?.response?.data?.error ?? 'Sin señal: la nota no se guardó. Inténtalo de nuevo con señal.')
    } finally {
      setGuardando(false)
    }
  }

  function ocultar(nota) {
    if (!confirm('¿Ocultar esta nota? No se borra: un supervisor la puede recuperar.')) return
    onCambiar(ul, nota._id, { visible: false }).catch((err) => {
      alert(err?.response?.data?.error ?? 'Sin señal: no se pudo ocultar')
    })
  }

  return (
    <div style={{ margin: '0.1rem 0 0.5rem 1.5rem' }}>
      {datos?.sinRed && (
        <div style={{ fontSize: '0.7rem', color: '#975a16', marginBottom: '0.25rem' }}>
          Sin señal: se muestran las notas guardadas en el teléfono.
        </div>
      )}
      {notas.length === 0 && !datos?.sinRed && (
        <div style={{ fontSize: '0.74rem', color: '#a0aec0', marginBottom: '0.25rem' }}>
          Sin notas para esta ruta.
        </div>
      )}
      {notas.map((n) => (
        <Nota key={n._id} nota={n}
          puedeCambiar={decide || String(n.autor) === String(usuario?.id)}
          onGuardar={(t) => onCambiar(ul, n._id, { texto: t })}
          onOcultar={() => ocultar(n)} />
      ))}
      <textarea className="form-control form-control-sm" rows={2} maxLength={1000}
        placeholder="Agregar nota (ej. clave del portón del condominio)"
        value={texto} onChange={(e) => setTexto(e.target.value)}
        style={{ fontSize: '0.78rem' }} />
      {error && <div style={{ color: '#c53030', fontSize: '0.72rem' }}>{error}</div>}
      <button className="btn btn-outline-primary btn-sm w-100 mt-1 py-0"
        onClick={agregar} disabled={guardando || !texto.trim()}>
        {guardando ? 'Guardando…' : '📝 Agregar nota'}
      </button>
    </div>
  )
}

// src/components/ReporteRuta.jsx
// El reporte de una ruta en un popup chico, con un botón para copiarlo y
// pegarlo en WhatsApp. La cuenta vive en utils/reporteRuta.js (con tests);
// acá solo se dibuja.
import { useRef, useState } from 'react'
import { Modal } from 'react-bootstrap'
import { formatearCiclo, textoCierre, textoReporte } from '../utils/reporteRuta'

// Copiar al portapapeles. La Clipboard API es lo normal, pero en algunos
// WebView de Android falla sin permiso; ahí se prueba con un textarea. Va
// DENTRO del popup y no en el body: el Modal le devuelve el foco a sí mismo y
// un textarea afuera no alcanzaría a quedar seleccionado.
async function copiarTexto(texto, contenedor) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* se prueba el otro camino */ }
  try {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    ;(contenedor ?? document.body).appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

// Los mismos colores que la etiqueta del panel: rojo cerrada, naranjo parcial.
const colorCierre = (cierre) => (cierre === 'final' ? '#c53030' : cierre ? '#dd6b20' : '#718096')

function Fila({ icono, texto, n, fuerte = true, apagado = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.3rem 0', borderTop: '1px solid #edf2f7',
      color: apagado ? '#a0aec0' : '#2d3748',
    }}>
      <span style={{ width: '1.3rem', textAlign: 'center' }} aria-hidden="true">{icono}</span>
      <span style={{ flex: 1 }}>{texto}</span>
      <span style={{ fontWeight: fuerte ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
    </div>
  )
}

function Detalle({ items }) {
  if (!items.length) return null
  return (
    <div style={{ margin: '-0.15rem 0 0.25rem 1.8rem', fontSize: '0.76rem', color: '#718096' }}>
      {items.map((x) => (
        <div key={x.clave} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{x.nombre} <span style={{ color: '#a0aec0' }}>({x.clave})</span></span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.n}</span>
        </div>
      ))}
    </div>
  )
}

export default function ReporteRuta({ reporte, onCerrar }) {
  const [copiado, setCopiado] = useState(null) // null | 'ok' | 'error'
  const cuerpoRef = useRef(null)
  if (!reporte) return null
  const r = reporte
  const texto = textoReporte(r)

  async function copiar() {
    const ok = await copiarTexto(texto, cuerpoRef.current)
    setCopiado(ok ? 'ok' : 'error')
    if (ok) setTimeout(() => setCopiado(null), 2000)
  }

  return (
    <Modal show onHide={onCerrar} centered size="sm">
      <div ref={cuerpoRef} style={{ padding: '0.9rem 1rem 1rem', fontSize: '0.86rem' }}>
        <div className="d-flex align-items-start justify-content-between">
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#2b6cb0' }}>
              📋 Ruta {r.ul}
            </div>
            <div style={{ fontSize: '0.76rem', color: '#718096' }}>
              Ciclo {formatearCiclo(r.ciclo)} ·{' '}
              <span style={{ color: colorCierre(r.cierre), fontWeight: 600 }}>
                {textoCierre(r.cierre)}
              </span>
            </div>
          </div>
          <button type="button" className="btn-close" aria-label="Cerrar" onClick={onCerrar} />
        </div>

        <div style={{ margin: '0.7rem 0 0.4rem' }}>
          <div className="d-flex justify-content-between" style={{ fontSize: '0.8rem' }}>
            <span><strong>{r.tomados}</strong> de {r.total} servicios</span>
            <span style={{ fontWeight: 700, color: '#2f855a' }}>{r.avance}%</span>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, marginTop: '0.2rem' }}>
            <div style={{
              width: Math.min(100, r.avance) + '%', height: '100%', background: '#38a169', borderRadius: 3,
            }} />
          </div>
        </div>

        <Fila icono="✅" texto="Leídos" n={r.leidos} />
        <Fila icono="🔒" texto="Casas cerradas" n={r.cerradas.total} apagado={!r.cerradas.total} />
        <Detalle items={r.cerradas.detalle} />
        <Fila icono="🏚️" texto="Sitios eriazos" n={r.eriazos} apagado={!r.eriazos} />
        <Fila icono="🔄" texto="Cambios de medidor" n={r.cambios} apagado={!r.cambios} />
        {r.otras.total > 0 && (
          <>
            <Fila icono="⚠️" texto="Otras claves" n={r.otras.total} />
            <Detalle items={r.otras.detalle} />
          </>
        )}
        <Fila icono="⏳" texto="Pendientes" n={r.pendientes} apagado={!r.pendientes} />
        <div style={{ borderTop: '1px dashed #cbd5e0', marginTop: '0.15rem' }}>
          <Fila icono="🆕" texto="Nuevos (no venían en la ruta)" n={r.nuevos} apagado={!r.nuevos} />
        </div>

        <button type="button"
          className={`btn btn-sm w-100 mt-2 ${copiado === 'ok' ? 'btn-success' : 'btn-primary'}`}
          onClick={copiar}>
          {copiado === 'ok' ? '✓ Copiado' : '📋 Copiar'}
        </button>
        {copiado === 'error' && (
          <>
            <div style={{ fontSize: '0.72rem', color: '#c53030', marginTop: '0.3rem' }}>
              No se pudo copiar solo. Mantén apretado el texto para copiarlo:
            </div>
            <textarea className="form-control form-control-sm mt-1" rows={6} readOnly
              value={texto} onFocus={(e) => e.target.select()} style={{ fontSize: '0.72rem' }} />
          </>
        )}
      </div>
    </Modal>
  )
}

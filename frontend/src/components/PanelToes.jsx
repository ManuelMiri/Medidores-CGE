// src/components/PanelToes.jsx
// Bloque del panel lateral con el estado de la integración con TOES.
// Sigue el estilo del resto del panel de Mapa.jsx (estilos en línea).

import { useRef, useState } from 'react'

function formatearCiclo(ciclo) {
  if (!ciclo) return null
  const [a, m, d] = ciclo.split('-')
  return `${d}-${m}-${a}`
}

function haceCuanto(fecha) {
  if (!fecha) return null
  const seg = Math.round((Date.now() - fecha.getTime()) / 1000)
  if (seg < 60) return `hace ${seg} s`
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`
  return `hace ${Math.round(seg / 3600)} h`
}

export default function PanelToes({ toes, medidores, ulsActivas }) {
  const archivoRef = useRef(null)
  const [aviso, setAviso] = useState(null)
  const [mostrarSinPunto, setMostrarSinPunto] = useState(false)

  const {
    porUl, indice, verTomados, setVerTomados, procesando, invalidos, ultimaRevision,
    nativo, carpeta, vigilando, errorNativo, listo,
  } = toes

  async function handleCarpeta() {
    const uri = await (carpeta ? toes.cambiarCarpeta() : toes.elegirCarpeta())
    if (uri) setAviso({ tipo: 'ok', texto: 'Carpeta conectada. Se relee sola cada 5 s.' })
  }

  async function handleArchivos(e) {
    const archivos = e.target.files
    if (!archivos?.length) return
    try {
      const total = await toes.procesarArchivos(archivos)
      setAviso({ tipo: 'ok', texto: `${total} servicio(s) leído(s) de ${archivos.length} archivo(s)` })
    } catch (err) {
      setAviso({ tipo: 'error', texto: 'No se pudo leer el log: ' + err.message })
    } finally {
      if (archivoRef.current) archivoRef.current.value = ''
    }
  }

  // Tomados en TOES que no tienen punto en el mapa: candidatos a mapear (§5.4)
  const instalacionesMapa = new Set(medidores.map((m) => m.instalacion))
  const sinPunto = [...indice.porInstalacion.keys()].filter((i) => !instalacionesMapa.has(i))

  const hayAlgo = ulsActivas.some((ul) => porUl[ul]?.ciclo)

  return (
    <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
      <p style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2b6cb0', margin: '0 0 0.5rem' }}>
        📋 Lecturas de TOES
      </p>

      {/* En el APK la carpeta se lee sola; en el navegador no hay forma de
          pedirla (Chrome Android no expone showDirectoryPicker), así que ahí
          el único camino es elegir los archivos a mano. */}
      {/* `listo` evita el parpadeo: hasta que no se cargó el estado guardado no
          se sabe si ya hay una carpeta concedida, y ofrecer conectarla cuando
          ya está conectada se ve como un error. */}
      {nativo && listo && !carpeta && (
        <>
          <button
            className="btn btn-sm btn-primary w-100"
            onClick={handleCarpeta}>
            📁 Conectar carpeta TOES
          </button>
          <p style={{ fontSize: '0.72rem', color: '#718096', margin: '0.35rem 0 0' }}>
            Se pide una sola vez. Elige la carpeta <code>TOES</code> del
            almacenamiento interno: la app solo la lee, nunca escribe en ella.
          </p>
        </>
      )}

      {vigilando && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: '4px',
          padding: '0.35rem 0.5rem', fontSize: '0.76rem', color: '#276749',
        }}>
          <span aria-hidden="true">👁</span>
          <span style={{ flex: 1 }}>Leyendo la carpeta TOES sola</span>
          <button
            className="btn btn-link p-0"
            style={{ fontSize: '0.7rem' }}
            onClick={handleCarpeta}>
            cambiar
          </button>
        </div>
      )}

      <button
        className={`btn btn-sm w-100 ${vigilando ? 'btn-outline-secondary' : 'btn-outline-primary'}`}
        style={vigilando ? { marginTop: '0.4rem', fontSize: '0.72rem' } : undefined}
        disabled={procesando}
        onClick={() => archivoRef.current?.click()}>
        {procesando
          ? 'Leyendo…'
          : vigilando
            ? 'Elegir un log a mano'
            : '📂 Actualizar desde TOES'}
      </button>
      <input
        ref={archivoRef}
        type="file"
        accept=".txt,text/plain"
        multiple
        onChange={handleArchivos}
        style={{ display: 'none' }}
      />
      {!vigilando && (
        <p style={{ fontSize: '0.72rem', color: '#718096', margin: '0.35rem 0 0' }}>
          Elige los <code>Log_TOES-*.txt</code> de la carpeta TOES del teléfono.
        </p>
      )}

      {errorNativo && (
        <p style={{ fontSize: '0.75rem', marginTop: '0.4rem', color: '#c53030' }}>
          {errorNativo}
        </p>
      )}

      {aviso && (
        <p style={{
          fontSize: '0.75rem', marginTop: '0.4rem',
          color: aviso.tipo === 'ok' ? '#2f855a' : '#c53030',
        }}>
          {aviso.texto}
        </p>
      )}

      {hayAlgo && (
        <>
          <div style={{ marginTop: '0.6rem', fontSize: '0.82rem' }}>
            {ulsActivas.map((ul) => {
              const d = porUl[ul]
              if (!d?.ciclo) return null
              const total = medidores.filter((m) => m.unidadDeLectura === ul).length
              const tomados = d.tomados.size
              const pct = total ? Math.round((tomados / total) * 100) : 0
              return (
                <div key={ul} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600 }}>
                    {ul}{' '}
                    {d.cierre && (
                      <span style={{
                        fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '4px',
                        background: d.cierre.tipo === 'final' ? '#c53030' : '#dd6b20',
                        color: 'white', verticalAlign: 'middle',
                      }}>
                        {d.cierre.tipo === 'final' ? 'CERRADA' : 'cierre parcial'}
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#4a5568' }}>
                    Ciclo {formatearCiclo(d.ciclo)}
                    {d.descartado && ' (descartado)'}
                  </div>
                  <div>
                    Tomados: <strong>{tomados}</strong> / {total}{' '}
                    <span style={{ color: '#718096' }}>({pct}%)</span>
                  </div>
                  <div style={{
                    height: '5px', background: '#e2e8f0', borderRadius: '3px', marginTop: '0.2rem',
                  }}>
                    <div style={{
                      width: pct + '%', height: '100%', background: '#38a169', borderRadius: '3px',
                    }} />
                  </div>
                  <button
                    className="btn btn-sm btn-outline-secondary w-100 mt-1"
                    style={{ fontSize: '0.7rem', padding: '0.1rem' }}
                    onClick={() => {
                      if (confirm(
                        `¿Marcar ciclo nuevo en ${ul}?\n\n` +
                        'Los puntos tomados vuelven a aparecer como pendientes. ' +
                        'No se borra ningún punto, foto ni etiqueta.'
                      )) toes.nuevoCiclo(ul)
                    }}>
                    Nuevo ciclo
                  </button>
                </div>
              )
            })}
          </div>

          <div className="form-check form-switch" style={{ marginTop: '0.4rem' }}>
            <input
              className="form-check-input"
              type="checkbox"
              id="verTomados"
              checked={verTomados}
              onChange={(e) => setVerTomados(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="verTomados" style={{ fontSize: '0.78rem' }}>
              Ver tomados (atenuados)
            </label>
          </div>

          {sinPunto.length > 0 && (
            <div style={{ marginTop: '0.4rem' }}>
              <button
                className="btn btn-sm btn-outline-warning w-100"
                style={{ fontSize: '0.72rem' }}
                onClick={() => setMostrarSinPunto((v) => !v)}>
                ⚠️ {sinPunto.length} tomado(s) sin punto en el mapa
              </button>
              {mostrarSinPunto && (
                <div style={{
                  fontSize: '0.72rem', marginTop: '0.3rem', maxHeight: '110px',
                  overflowY: 'auto', background: '#fffaf0', padding: '0.3rem',
                  borderRadius: '4px', fontFamily: 'monospace',
                }}>
                  {sinPunto.map((i) => <div key={i}>{i}</div>)}
                  <button
                    className="btn btn-sm btn-link p-0"
                    style={{ fontSize: '0.7rem' }}
                    onClick={() => navigator.clipboard?.writeText(sinPunto.join('\n'))}>
                    copiar lista
                  </button>
                </div>
              )}
            </div>
          )}

          <p style={{ fontSize: '0.7rem', color: '#718096', margin: '0.4rem 0 0' }}>
            {ultimaRevision && `Última revisión ${haceCuanto(ultimaRevision)}`}
            {invalidos > 0 && (
              <span style={{ color: '#c53030' }}>
                {' · '}{invalidos} bloque(s) ilegible(s)
              </span>
            )}
          </p>
        </>
      )}
    </div>
  )
}

// src/components/DetalleMedidor.jsx
// Lo que se ve DENTRO del popup de un punto del mapa.
//
// Vive aparte de la capa de pines porque ahora lo usan dos motores: la capa de
// Leaflet (CapaMedidores.jsx) y la de MapLibre (MapaGL.jsx). Si cada una
// tuviera su copia, un arreglo en el bloque de marca permanente o en el botón
// de foto quedaría aplicado en uno solo — y la diferencia no se vería hasta que
// alguien en terreno usara el motor equivocado.
//
// No importa nada de ningún motor a propósito: cerrar el popup entra como
// `onCerrar`, porque es lo único que cada uno hace a su manera.

import { useState } from 'react'
import CapturaFoto from './CapturaFoto'
import { marcaDe, textoToes } from '../utils/vistaMarcador'
import { urlNavegacion } from '../utils/navegacion'

// "14-10" para las fechas cortas del popup; vacío si no hay fecha.
function diaMes(fecha) {
  const d = fecha ? new Date(fecha) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Botón ✕ propio del popup (el del motor se esconde en escritorio, porque ahí
// el popup sale corrido a la derecha del pin y el ✕ original queda flotando en
// otro lado).
function CerrarPopup({ onCerrar }) {
  return (
    <button type="button" className="btn-close btn-sm" aria-label="Cerrar"
      style={{ fontSize: '0.6rem' }}
      onClick={onCerrar} />
  )
}

// Si en el punto hay un solo medidor, muestra sus datos directo. Si hay varios,
// primero la lista para elegir cuál, y al elegir uno sus datos con un botón
// para volver a la lista.
export function ContenidoPopup(props) {
  // Ojo con esto: React atiende el click ANTES que el mapa, y como al tocar un
  // botón de la lista cambia lo que se muestra, cuando el click le llega al
  // mapa el botón ya no existe. El mapa cree entonces que tocaste el fondo y
  // cierra el popup. Cortando el click aquí no le llega nunca.
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContenidoPopupInterno {...props} />
    </div>
  )
}

function ContenidoPopupInterno({ grupo, elegido, onElegir, esMobil, onCerrar, renderDetalle }) {
  const [verLista, setVerLista] = useState(!elegido)

  if (grupo.length === 1) return renderDetalle(grupo[0])

  if (elegido && !verLista) {
    return (
      <div>
        <button type="button" className="btn btn-link btn-sm p-0 mb-1"
          style={{ fontSize: '0.75rem' }} onClick={() => setVerLista(true)}>
          ← Ver los {grupo.length} de este punto
        </button>
        {renderDetalle(elegido)}
      </div>
    )
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <h6 style={{ fontSize: '0.9rem' }} className="mb-0">📍 {grupo.length} medidores aquí</h6>
        {!esMobil && <CerrarPopup onCerrar={onCerrar} />}
      </div>
      <hr style={{ margin: '0.3rem 0' }} />
      <div className="d-grid gap-1">
        {grupo.map(m => (
          <button key={m._id} type="button"
            className={`btn btn-sm text-start ${elegido?._id === m._id ? 'btn-warning' : 'btn-outline-secondary'}`}
            style={{ fontSize: '0.8rem' }}
            onClick={() => {
              // si ya era el elegido, solo muestro sus datos; si no, lo
              // selecciono (el pin se vuelve a montar y abre con sus datos)
              if (elegido?._id === m._id) setVerLista(false)
              else onElegir(m)
            }}>
            <strong>{m.instalacion}</strong>
            <span className="text-muted"> · {m.estado}</span>
            {m.numeroDePoste && <span className="text-muted"> · poste {m.numeroDePoste}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}

const TEXTO_SITUACION = {
  propuesta: 'lo reportó TOES, falta confirmar',
  confirmada: 'confirmado en terreno',
  rechazada: 'se revisó y sí hay medidor',
}

/**
 * Aviso de "acá ya no hay medidor" dentro del popup.
 *
 * Es lo que ve el lector del mes siguiente —que puede ser otra persona— para
 * no perder tiempo buscando un medidor que se sacó, se destruyó o se robaron.
 * Confirmar o rechazar queda para admin y supervisor: el lector reporta desde
 * TOES, pero descartar un punto para los próximos meses no es decisión suya.
 */
export function BloqueMarca({ medidor, toesConfig, puedeDecidir, onResolver }) {
  const [marcando, setMarcando] = useState(false)
  const marca = marcaDe(medidor)
  const resolverTipo = (accion, tipo) => onResolver?.(medidor.instalacion, accion, tipo)

  // Sin marca: solo un admin o supervisor puede poner una a mano. Es la única
  // vía para "sin empalme" — TOES no lo puede reportar — y sirve además para
  // un eriazo que el lector no alcanzó a registrar en TOES.
  if (!marca) {
    if (!puedeDecidir) return null
    if (!marcando) {
      return (
        <button className="btn btn-link btn-sm p-0 mb-1" style={{ fontSize: '0.72rem' }}
          onClick={() => setMarcando(true)}>
          marcar que acá ya no hay medidor
        </button>
      )
    }
    return (
      <div className="d-grid gap-1 mb-2">
        {Object.entries(toesConfig?.etiquetas ?? {}).map(([tipo, e]) => (
          <button key={tipo} className="btn btn-sm btn-outline-dark"
            style={{ fontSize: '0.72rem', borderLeft: `4px solid ${e.color}` }}
            onClick={() => { setMarcando(false); resolverTipo('marcar', tipo) }}>
            {e.nombre}
          </button>
        ))}
        <button className="btn btn-link btn-sm p-0" style={{ fontSize: '0.7rem' }}
          onClick={() => setMarcando(false)}>cancelar</button>
      </div>
    )
  }

  const etiqueta = toesConfig?.etiquetas?.[marca.tipo]
  const nombre = etiqueta?.nombre ?? marca.tipo
  const color = marca.situacion === 'rechazada' ? '#718096' : (etiqueta?.color ?? '#718096')
  const resolver = (accion) => resolverTipo(accion)

  return (
    <div style={{
      border: `1px solid ${color}`, borderLeft: `4px solid ${color}`,
      borderRadius: '4px', padding: '0.35rem 0.5rem', margin: '0 0 0.4rem',
      fontSize: '0.78rem',
    }}>
      <div style={{ fontWeight: 700, color }}>
        {marca.situacion === 'rechazada' ? '↩️' : '🚫'} {nombre}
      </div>
      <div style={{ color: '#4a5568' }}>
        {TEXTO_SITUACION[marca.situacion] ?? marca.situacion}
        {marca.claveToes && ` · clave ${marca.claveToes}`}
      </div>

      {marca.situacion === 'propuesta' && puedeDecidir && (
        <div className="d-flex gap-1 mt-1">
          <button className="btn btn-sm btn-success" style={{ fontSize: '0.72rem' }}
            onClick={() => resolver('confirmar')}>Confirmar</button>
          <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '0.72rem' }}
            onClick={() => resolver('rechazar')}>Sí hay medidor</button>
        </div>
      )}
      {marca.situacion === 'propuesta' && !puedeDecidir && (
        <div style={{ color: '#718096', fontStyle: 'italic' }}>
          Lo confirma un supervisor.
        </div>
      )}
      {marca.situacion !== 'propuesta' && (
        <button className="btn btn-link btn-sm p-0 mt-1" style={{ fontSize: '0.72rem' }}
          onClick={() => resolver('quitar')}>quitar la marca</button>
      )}
    </div>
  )
}

/** La ficha de un medidor: lo que se ve cuando el punto ya está elegido. */
export function DetalleMedidor({
  medidor, toesDelMedidor, toesConfig, rolUsuario, esMobil,
  onCerrar, onEditar, onEliminar, onFotoSubida, onResolverMarca,
}) {
  const decide = rolUsuario === 'admin' || rolUsuario === 'supervisor'
  const urlIr = urlNavegacion(medidor)

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <h6 style={{ fontSize: '0.9rem' }} className="mb-0">📍 {medidor.instalacion}</h6>
        {!esMobil && <CerrarPopup onCerrar={onCerrar} />}
      </div>
      <hr style={{ margin: '0.3rem 0' }} />
      <BloqueMarca
        medidor={medidor}
        toesConfig={toesConfig}
        puedeDecidir={decide}
        onResolver={onResolverMarca}
      />
      {toesDelMedidor && (
        <p style={{
          margin: '0 0 0.3rem', fontSize: '0.78rem',
          color: '#2f855a', fontWeight: 600,
        }}>
          ✔️ {textoToes(toesDelMedidor, toesConfig)}
        </p>
      )}
      {/* Un pin creado desde TOES (medidor.desdeToes) no lleva aviso, a propósito:
          hubo uno y al usuario no le gustó. Con la dirección y el poste del log
          se ve igual que uno de MLA; de dónde salió queda en el historial. */}
      <p style={{ margin: 0, fontSize: '0.8rem' }}>
        <strong>Estado del mapeo:</strong> {medidor.estado}<br />
        <strong>Dirección:</strong> {medidor.direccion || '—'}<br />
        <strong>Poste:</strong> {medidor.numeroDePoste || '—'}<br />
        <strong>Serie:</strong> {medidor.numeroDeSerie || '—'}<br />
        {/* El lupa es el medidor del poste que se compara con el de la casa:
            el lector tiene que saber que existe para no confundirlo con otro
            servicio cuando lo encuentra afuera. */}
        {medidor.medidorLupa?.numeroDeSerie && (
          <><strong>Medidor lupa:</strong> serie {medidor.medidorLupa.numeroDeSerie}
            {medidor.medidorLupa.marca && ` (${medidor.medidorLupa.marca})`}<br /></>
        )}
        {/* Lo registra TOES cuando el lector cambia el medidor. El anterior
            queda a la vista porque es el que alguien con la ruta vieja va a
            buscar en el poste. */}
        {medidor.cambioMedidor && (
          <><strong>{medidor.cambioMedidor.cual === 'lupa' ? 'Lupa cambiado' : 'Medidor cambiado'}:</strong>{' '}
            {diaMes(medidor.cambioMedidor.fecha)} · antes {medidor.cambioMedidor.serieAnterior || '—'}
            {medidor.cambioMedidor.marcaAnterior && ` (${medidor.cambioMedidor.marcaAnterior})`}<br /></>
        )}
        {decide && (
          <><strong>UL:</strong> {medidor.unidadDeLectura || '—'}<br /></>
        )}
        {medidor.observaciones && <><strong>Obs:</strong> {medidor.observaciones}<br /></>}
      </p>
      <div className="d-flex gap-1 mt-2">
        <button className="btn btn-primary btn-sm"
          onClick={() => onEditar(medidor)}>✏️ Editar</button>
        {urlIr && (
          <a className="btn btn-success btn-sm" href={urlIr}
            target="_blank" rel="noreferrer">🚗 Ir</a>
        )}
        {rolUsuario === 'admin' && (
          <button className="btn btn-danger btn-sm"
            onClick={() => onEliminar(medidor.instalacion)}>🗑️</button>
        )}
      </div>

      {/* Foto directo desde el popup, sin tener que entrar a editar — así el
          técnico saca la foto ahí mismo, parado frente al medidor. */}
      <CapturaFoto
        instalacion={medidor.instalacion}
        fotosExistentes={medidor.fotos}
        onFotoSubida={onFotoSubida}
      />
    </div>
  )
}

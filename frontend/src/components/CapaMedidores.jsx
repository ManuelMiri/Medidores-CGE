// src/components/CapaMedidores.jsx
// La capa de pines del mapa: qué marcadores se dibujan y qué muestra cada popup.
//
// Vive aparte de Mapa.jsx por rendimiento, no por orden. Una ruta cargada trae
// entre 170 y 300 medidores (1.765 si se activan todas las ULs), y antes todo
// esto se rearmaba dentro del render de Mapa.jsx. Como react-leaflet compara
// los props por IDENTIDAD, los literales `position={[lat, lng]}` y
// `eventHandlers={{...}}` daban siempre distinto y hacían que, en cada render
// de Mapa, cada marcador ejecutara un `setLatLng()` — una escritura de
// layout — más un `off()`+`on()` de sus listeners. Con 300 pines son ~600
// operaciones de DOM por cada cambio de estado del componente, aunque no
// tuviera nada que ver con el mapa (escribir en el buscador, abrir el panel).
//
// Dos cosas lo arreglan, y las dos están acá:
//   1. `MarcadorGrupo` va memoizado y recibe props estables (la posición viene
//      ya creada desde el agrupado, los callbacks desde useCallback), así que
//      un render de Mapa no lo vuelve a tocar.
//   2. Solo se dibujan los pines que caen en la pantalla (culling). El resto
//      no existe en el DOM, así que Leaflet no los reposiciona en cada zoom.

import { memo, useMemo, useState } from 'react'
import { Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import CapturaFoto from './CapturaFoto'
import { textoToes } from '../utils/vistaMarcador'
import { iconoConContador, iconoSeleccionado } from '../utils/iconosMapa'

// Margen alrededor de la pantalla, como fracción del alto/ancho visible. Con
// esto los pines ya están puestos antes de entrar al cuadro, así que al
// arrastrar no se ven aparecer en el borde. 0.5 = media pantalla de colchón
// por lado, que cubre un arrastre normal sin pasarse de marcadores.
const MARGEN = 0.5

// Botón ✕ propio para el popup (el de Leaflet lo escondo en escritorio
// porque ahí corro el popup a la derecha del pin y el ✕ original quedaba
// flotando en otro lado)
function CerrarPopup() {
  const map = useMap()
  return (
    <button type="button" className="btn-close btn-sm" aria-label="Cerrar"
      style={{ fontSize: '0.6rem' }}
      onClick={() => map.closePopup()} />
  )
}

// Lo que va dentro del popup. Si en el punto hay un solo medidor, muestra
// sus datos directo. Si hay varios, primero la lista para elegir cuál, y
// al elegir uno sus datos con un botón para volver a la lista.
function ContenidoPopup(props) {
  // Ojo con esto: React atiende el click ANTES que Leaflet, y como al tocar
  // un botón de la lista cambio lo que se muestra, cuando el click le llega
  // a Leaflet el botón ya no existe. Leaflet cree entonces que tocaste el
  // mapa y cierra el popup. Cortando el click aquí no le llega nunca.
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContenidoPopupInterno {...props} />
    </div>
  )
}

function ContenidoPopupInterno({ grupo, elegido, onElegir, esMobil, renderDetalle }) {
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
        {!esMobil && <CerrarPopup />}
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

/**
 * Un pin del mapa (un punto, con uno o varios medidores).
 *
 * Memoizado: con 300 pines en pantalla, lo que importa es que un render de
 * Mapa que no cambió nada de ESTE grupo no lo toque. Para que el memo sirva,
 * todos los props tienen que ser estables — `position` viene ya creada desde
 * `agruparCercanos`, `vista` desde un useMemo, y los callbacks desde
 * useCallback en Mapa.
 */
const MarcadorGrupo = memo(function MarcadorGrupo({
  grupo, vista, idGrupo, elegido, marcado, esMobil, rolUsuario, toesConfig,
  onElegir, onElegirGrupo, onEditar, onEliminar, onFotoSubida,
}) {
  const visibles = vista.visibles
  const varios = visibles.length > 1

  // dorado si el medidor seleccionado está aquí o si tocaste este grupo; si
  // no, el color que decidió la capa TOES (estado de mapeo, o el color de la
  // clave si fue tomado y está solo). Si son varios, va con el contador.
  const base = marcado ? iconoSeleccionado : vista.icono
  const icono = varios ? iconoConContador(base, visibles.length) : base

  // Estables mientras no cambie lo que miran, que es lo que hace que
  // react-leaflet no vuelva a enganchar los listeners en cada render.
  const manejadores = useMemo(() => {
    if (marcado) return { add: (e) => e.target.openPopup() }
    // si es uno solo lo selecciono al tocarlo; si son varios marco el grupo
    // (dorado) y se abre la lista para elegir
    if (varios) return { click: () => onElegirGrupo(idGrupo) }
    return { click: () => onElegir(visibles[0]._id) }
  }, [marcado, varios, idGrupo, visibles, onElegir, onElegirGrupo])

  const renderDetalle = (m) => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <h6 style={{ fontSize: '0.9rem' }} className="mb-0">📍 {m.instalacion}</h6>
        {!esMobil && <CerrarPopup />}
      </div>
      <hr style={{ margin: '0.3rem 0' }} />
      {vista.toesPorId.has(m._id) && (
        <p style={{
          margin: '0 0 0.3rem', fontSize: '0.78rem',
          color: '#2f855a', fontWeight: 600,
        }}>
          ✔️ {textoToes(vista.toesPorId.get(m._id), toesConfig)}
        </p>
      )}
      <p style={{ margin: 0, fontSize: '0.8rem' }}>
        <strong>Estado:</strong> {m.estado}<br />
        <strong>Dirección:</strong> {m.direccion || '—'}<br />
        <strong>Poste:</strong> {m.numeroDePoste || '—'}<br />
        <strong>Serie:</strong> {m.numeroDeSerie || '—'}<br />
        {(rolUsuario === 'admin' || rolUsuario === 'supervisor') && (
          <><strong>UL:</strong> {m.unidadDeLectura || '—'}<br /></>
        )}
        {m.observaciones && <><strong>Obs:</strong> {m.observaciones}<br /></>}
      </p>
      <div className="d-flex gap-1 mt-2">
        <button className="btn btn-primary btn-sm"
          onClick={() => onEditar(m)}>✏️ Editar</button>
        {rolUsuario === 'admin' && (
          <button className="btn btn-danger btn-sm"
            onClick={() => onEliminar(m.instalacion)}>🗑️</button>
        )}
      </div>

      {/* Foto directo desde el popup, sin tener que entrar
          a editar — así el técnico saca la foto ahí mismo,
          parado frente al medidor. */}
      <CapturaFoto
        instalacion={m.instalacion}
        fotosExistentes={m.fotos}
        onFotoSubida={onFotoSubida}
      />
    </div>
  )

  return (
    <Marker
      position={grupo.position}
      icon={icono}
      // atenuado si todo lo que queda en este pin ya fue tomado
      opacity={vista.opacidad}
      // encima de los demás pines si están pegados
      zIndexOffset={marcado ? 1000 : 0}
      eventHandlers={manejadores}
    >
      {/* En escritorio el popup sale a la DERECHA del pin (clase
          popup-derecha en index.css) para no tapar los pines de
          arriba. En el celular no hay espacio al lado, así que
          ahí sigue saliendo arriba como siempre. Los paddings
          son para que Leaflet mueva el mapa si el popup no cabe. */}
      <Popup
        minWidth={220} maxWidth={260}
        className={esMobil ? '' : 'popup-derecha'}
        closeButton={esMobil}
        autoPanPaddingTopLeft={[20, 20]}
        autoPanPaddingBottomRight={esMobil ? [20, 20] : [170, 230]}
      >
        <ContenidoPopup
          grupo={visibles}
          elegido={elegido}
          onElegir={(m) => onElegir(m._id)}
          esMobil={esMobil}
          renderDetalle={renderDetalle}
        />
      </Popup>
    </Marker>
  )
})

export default function CapaMedidores({
  grupos, vistas, seleccionadoId, grupoSeleccionado, esMobil, rolUsuario, toesConfig,
  onElegir, onElegirGrupo, onEditar, onEliminar, onFotoSubida,
}) {
  const map = useMap()

  // Culling: solo se dibujan los pines del cuadro visible (más el margen).
  // Se guarda el cuadro en estado para que el filtro se recalcule al terminar
  // de mover el mapa. Vive acá dentro y no en Mapa.jsx a propósito: así el
  // re-render de cada arrastre queda contenido en esta capa.
  const [cuadro, setCuadro] = useState(() => map.getBounds().pad(MARGEN))
  const recalcular = () => setCuadro(map.getBounds().pad(MARGEN))
  // moveend cubre también el final del zoom, pero zoomend va igual porque con
  // markerZoomAnimation apagado conviene refrescar en cuanto termina.
  //
  // `resize` no es de adorno: al montar, el div del mapa a veces todavía no
  // tiene su tamaño final, y ahí getBounds() devuelve un cuadro degenerado que
  // dejaría todos los pines afuera. InvalidarTamano llama a invalidateSize(),
  // que emite `resize`, y con eso el cuadro queda bien. Lo mismo al mostrar u
  // ocultar el panel lateral o al rotar el celular.
  useMapEvents({ moveend: recalcular, zoomend: recalcular, resize: recalcular })

  const aDibujar = useMemo(() => {
    const lista = []
    for (let i = 0; i < grupos.length; i++) {
      const vista = vistas[i]
      if (vista.oculto) continue
      const grupo = grupos[i]
      const elegido = seleccionadoId
        ? vista.visibles.find((m) => m._id === seleccionadoId)
        : undefined
      // El elegido se dibuja SIEMPRE, aunque caiga fuera del cuadro. Al
      // buscar un medidor se lo selecciona antes de que el mapa termine de
      // moverse, y es el montaje de su marcador lo que abre el popup: si el
      // culling lo dejara afuera en ese instante, buscar no mostraría nada.
      if (!elegido && !cuadro.contains(grupo.position)) continue
      const idGrupo = vista.visibles.map((m) => m._id).join('-')
      lista.push({
        grupo,
        vista,
        idGrupo,
        elegido,
        marcado: Boolean(elegido) || grupoSeleccionado === idGrupo,
      })
    }
    return lista
  }, [grupos, vistas, cuadro, seleccionadoId, grupoSeleccionado])

  return aDibujar.map(({ grupo, vista, idGrupo, elegido, marcado }) => (
    <MarcadorGrupo
      // cambio la key al seleccionarlo para que el marcador se vuelva a
      // montar en dorado y abra su popup solo (evento "add"); así funciona
      // igual si lo tocaste o lo buscaste (lleva el id del elegido para que
      // también se vuelva a montar al elegir otro medidor del mismo grupo)
      key={elegido ? idGrupo + '-sel-' + elegido._id : (marcado ? idGrupo + '-grupo' : idGrupo)}
      grupo={grupo}
      vista={vista}
      idGrupo={idGrupo}
      elegido={elegido}
      marcado={marcado}
      esMobil={esMobil}
      rolUsuario={rolUsuario}
      toesConfig={toesConfig}
      onElegir={onElegir}
      onElegirGrupo={onElegirGrupo}
      onEditar={onEditar}
      onEliminar={onEliminar}
      onFotoSubida={onFotoSubida}
    />
  ))
}

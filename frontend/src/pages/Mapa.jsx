// src/pages/Mapa.jsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, LayersControl, LayerGroup, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Spinner, Alert, Form, InputGroup, Button, Modal } from 'react-bootstrap'
import api from '../services/api'
import { App } from '@capacitor/app'
import { useAuth } from '../context/AuthContext'
import CargaKml from '../components/CargaKml'
import CapturaFoto from '../components/CapturaFoto'
import GestionUsuarios from '../components/GestionUsuarios'
import MiUbicacion from '../components/MiUbicacion'
import PanelToes from '../components/PanelToes'
import CapaMedidores from '../components/CapaMedidores'
import { useToes } from '../hooks/useToes'
import { useMarcasToes } from '../hooks/useMarcasToes'
import { vistaDeGrupo } from '../utils/vistaMarcador'
import { iconos } from '../utils/iconosMapa'
import { agruparCercanos } from '../utils/agrupar'
import { ulsARestaurar, ulsTrasRecargar } from '../utils/ulsActivas'
import { URL_CALLES, URL_FOTO, URL_FOTO_RESPALDO, URL_CAMINOS, nombreDeCapa } from '../config/capasMapa'
import { descargarRuta, hayPrecarga, presupuestoDeRuta } from '../utils/precargaTiles'
import { medicionActiva, registrarMapaParaMedicion } from '../utils/medirFluidez'
import MapaGL from '../components/MapaGL'
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

// Le da al medidor de fluidez una forma de dejar el mapa en una vista exacta.
// Va por un adaptador y no hablandole a Leaflet directo para que, cuando haya
// otro motor, la misma herramienta pueda medir los dos y compararlos.
function RegistrarParaMedicion({ grupos }) {
  const map = useMap()

  useEffect(() => {
    if (!medicionActiva()) return
    const vista = () => {
      const c = map.getCenter()
      return { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), zoom: map.getZoom() }
    }

    registrarMapaParaMedicion({
      motor: 'leaflet',
      // Sin animación: la medición empieza justo después, y una animación en
      // curso ensuciaría los primeros frames de la corrida.
      irA: (lat, lng, zoom) => {
        map.setView([lat, lng], zoom, { animate: false })
        return vista()
      },

      // Centra sobre los pines cargados. Hace falta porque una coordenada
      // escrita a mano puede caer en una zona sin ningún pin, y ahí la
      // medición deja de decir nada sobre el costo de los marcadores: mide
      // tiles sobre un mapa vacío. Pasó en la primera corrida anclada.
      //
      // El centro es el centroide de los grupos, así que depende solo de los
      // datos: dos builds con la misma UL cargada miran exactamente lo mismo.
      irAPines: (zoom) => {
        if (!grupos.length) return null
        let lat = 0
        let lng = 0
        for (const g of grupos) {
          lat += g.position[0]
          lng += g.position[1]
        }
        map.setView([lat / grupos.length, lng / grupos.length], zoom, { animate: false })
        return vista()
      },

      vista,
    })
    return () => registrarMapaParaMedicion(null)
  }, [map, grupos])

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
function FormularioMedidor({ campos, setCampos, uls, nuevoPunto, medidorEdit, guardando, onGuardar, onCerrar, onFotoSubida, onMover }) {
  return (
    <>
      {nuevoPunto && (
        <div className="alert alert-success py-1 px-2 mb-2" style={{ fontSize: '0.78rem' }}>
          📍 Lat: {nuevoPunto[0].toFixed(5)}, Lng: {nuevoPunto[1].toFixed(5)}
        </div>
      )}

      {/* Solo llega `onMover` si el usuario puede mover (admin o supervisor). */}
      {medidorEdit && onMover && (
        <button
          className="btn btn-outline-secondary btn-sm w-100 mb-2"
          onClick={() => onMover(medidorEdit)}>
          📍 Cambiar ubicación en el mapa
        </button>
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

// Y lo mismo con las ULs marcadas. Antes, al cerrar y volver a abrir la app
// siempre quedaba seleccionada la primera de la lista: si estabas trabajando
// en la UL de más abajo, tenías que volver a buscarla y marcarla cada vez.
const CLAVE_ULS = 'ulsActivas'
function leerUlsGuardadas() {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_ULS) ?? '[]')
    return Array.isArray(lista) ? lista.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}
// Se lee UNA vez al cargar el módulo, igual que la capa. Hacerlo dentro del
// componente no serviría: el efecto que guarda corre al montar, cuando
// ulsActivas todavía es [], y pisaría lo guardado antes de poder leerlo.
const ulsIniciales = leerUlsGuardadas()

function RecordarCapa({ onCambio }) {
  useMapEvents({
    baselayerchange: (e) => {
      const capa = e.name === 'Satélite' ? 'satelite' : 'calles'
      try { localStorage.setItem(CLAVE_CAPA, capa) } catch { /* sin storage, da igual */ }
      // La capa visible también la necesita la precarga, para saber qué
      // cuadros bajar: no tiene sentido bajar la foto si estás en calles.
      onCambio(capa)
    },
  })
  return null
}

// Se resuelve una vez: no puede cambiar durante la sesión.
const puedePrecargar = hayPrecarga()

// Motor del mapa. El de produccion es MapLibre, sobre GPU.
//
// Medido en el telefono (A36, z16, misma zona, misma UL, con la vista anclada):
// el p95 por frame pasa de 57 ms a 16 ms, o sea por debajo del presupuesto de
// 16,7 ms de un frame a 60 Hz, y los ~130 marcadores de una ruta dejan de
// costar +19 ms por frame para no costar nada medible.
//
// Leaflet se queda como RED DE SEGURIDAD, no por indecision: la distribucion es
// por sideload, asi que si algo aparece en terreno no hay forma de publicar un
// arreglo — hay que reinstalar en cada telefono. Teniendo el motor viejo a un
// flag de distancia, el lector puede seguir trabajando el mismo dia.
//
// Se cambia desde el pie del panel lateral (ver PieDelPanel), que recarga la
// app. Tambien se puede a mano desde la consola del WebView:
//   localStorage.setItem('motorMapa', 'leaflet')
//
// Se lee UNA vez al cargar el modulo: cambiar de motor en caliente obligaria a
// desmontar y volver a montar el mapa entero, y no vale la pena por algo que se
// toca una vez cada varios meses.
const CLAVE_MOTOR = 'motorMapa'
const MOTOR_GL = (() => {
  try { return localStorage.getItem(CLAVE_MOTOR) !== 'leaflet' } catch { return true }
})()

/**
 * El pie del panel: qué versión del APK es ésta y con qué motor está dibujando
 * el mapa.
 *
 * La versión NO es un adorno. La app se reparte por sideload, sin Play Store y
 * sin actualización automática, así que la única forma de saber qué build tiene
 * un teléfono es preguntársela — y antes había que entrar a los ajustes de
 * Android a buscarla.
 *
 * El cambio de motor tampoco. Leaflet se dejó entero justamente para que, si
 * MapLibre falla en terreno, el lector siga trabajando el mismo día; pero hasta
 * acá la única forma de cambiarlo era `localStorage` desde la consola del
 * WebView, o sea con un cable, adb y DevTools. En el teléfono de un lector eso
 * no existe, y una salida de emergencia que necesita un PC no es una salida.
 */
function PieDelPanel() {
  const [version, setVersion] = useState(null)

  useEffect(() => {
    // Sale del APK, así que no hay una segunda copia del número que se pueda
    // desincronizar con build.gradle. En el navegador no hay versión y el
    // bloque simplemente no la muestra.
    App.getInfo()
      .then((i) => setVersion(`${i.version} (${i.build})`))
      .catch(() => {})
  }, [])

  const cambiarMotor = () => {
    const aClasico = MOTOR_GL
    const aviso = aClasico
      ? 'Volver al mapa clásico.\n\nEs más lento pero lleva años andando. Úsalo si el mapa nuevo se porta raro.'
      : 'Volver al mapa nuevo (más rápido).'
    if (!confirm(`${aviso}\n\nLa app se va a recargar.`)) return
    try {
      if (aClasico) localStorage.setItem(CLAVE_MOTOR, 'leaflet')
      else localStorage.removeItem(CLAVE_MOTOR)
    } catch { /* sin storage no se puede cambiar, y tampoco se pudo guardar */ }
    window.location.reload()
  }

  return (
    <div style={{
      marginTop: 'auto', padding: '0.6rem 0.75rem',
      borderTop: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#718096',
    }}>
      <div>Mapa: <strong>{MOTOR_GL ? 'nuevo' : 'clásico'}</strong></div>
      <button type="button" className="btn btn-link btn-sm p-0"
        style={{ fontSize: '0.72rem' }} onClick={cambiarMotor}>
        {MOTOR_GL ? 'usar el mapa clásico' : 'volver al mapa nuevo'}
      </button>
      {version && <div style={{ marginTop: '0.2rem' }}>Versión {version}</div>}
    </div>
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
  const [filtroUl, setFiltroUl]         = useState('')
  // Arranca cerrada si había ULs guardadas (se vuelve a la ruta del día sin
  // tocar nada) y abierta la primera vez, que es cuando hay que elegir.
  const [listaUlsAbierta, setListaUlsAbierta] = useState(ulsIniciales.length === 0)
  const [miUbicacionActiva, setMiUbicacionActiva] = useState(false)
  // Contador del botón "centrar en mí": cada toque lo sube y el motor que esté
  // montado centra en la posición. Un número y no un booleano para que tocarlo
  // dos veces seguidas centre las dos veces.
  const [pedidoCentrar, setPedidoCentrar] = useState(0)
  const [centroMapa, setCentroMapa]     = useState(null)
  // _id del medidor seleccionado (tocado o encontrado con el buscador),
  // para pintarlo dorado hasta que toques o busques otro
  const [seleccionadoId, setSeleccionadoId] = useState(null)
  // grupo (pin con número) que tocaste y todavía no eliges cuál medidor es;
  // también se pinta dorado para que sepas qué punto tocaste
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null)

  // Cuántas veces se eligió un medidor a propósito. NO es lo mismo que
  // `seleccionadoId`: buscar dos veces seguidas la MISMA instalación no cambia
  // el id, pero sí es una petición nueva de "mostrame este" y el popup tiene
  // que volver a abrirse. Es lo que deja al mapa distinguir una selección nueva
  // de un simple cambio de datos.
  const [pulsoSeleccion, setPulsoSeleccion] = useState(0)

  // selecciono un medidor y suelto el grupo que hubiera tocado antes.
  // Los callbacks que recibe CapaMedidores van con useCallback porque sus
  // marcadores están memoizados: un callback nuevo en cada render haría que
  // los ~300 pines se re-renderizaran igual y el memo no serviría de nada.
  const seleccionarMedidor = useCallback((id) => {
    setGrupoSeleccionado(null)
    setSeleccionadoId(id)
    setPulsoSeleccion((n) => n + 1)
  }, [])

  const elegirGrupo = useCallback((idGrupo) => {
    setSeleccionadoId(null)
    setGrupoSeleccionado(idGrupo)
  }, [])
  const [modoAgregar, setModoAgregar]   = useState(false)
  // El medidor que se está moviendo (admin/supervisor), o null. Mientras hay
  // uno, tocar el mapa lo lleva ahí en vez de crear un punto nuevo.
  const [moviendo, setMoviendo]         = useState(null)
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

  // La foto satelital de respaldo (z15) se monta SOLO si la foto buena llegó
  // a fallar alguna vez. Ver el comentario de la capa satelital, más abajo.
  const [fotoFallo, setFotoFallo] = useState(false)

  // Capa visible: la usan la precarga de tiles (para saber qué cuadros bajar)
  // y el motor GL, que no tiene el LayersControl de Leaflet.
  const [capaActiva, setCapaActiva] = useState(capaInicial)

  // En Leaflet la elección se guarda desde el evento baselayerchange; en GL
  // el botón llama acá. Por eso la escritura al storage vive en los dos lados
  // y no dentro de RecordarCapa.
  const cambiarCapa = useCallback((capa) => {
    setCapaActiva(capa)
    try { localStorage.setItem(CLAVE_CAPA, capa) } catch { /* sin storage, da igual */ }
  }, [])

  // Estable: MapaGL la usa dentro de un efecto con dependencias.
  const avisarErrorUbicacion = useCallback((msg, fatal) => {
    alert(msg)
    if (fatal) setMiUbicacionActiva(false)
  }, [])
  // Descarga de tiles en curso: { ul, hechas, total, fallidas, mensaje }
  const [precarga, setPrecarga] = useState(null)
  // Estable: un objeto nuevo en cada render haría que react-leaflet
  // desenganchara y volviera a enganchar el listener de la capa entera.
  const manejadoresFoto = useMemo(() => ({
    tileerror: () => setFotoFallo(true),
  }), [])

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
  // Todo lo que muestra el panel Resumen, en UNA pasada sobre los medidores.
  // Antes eran cuatro `medidores.filter(...)` escritos en el JSX, o sea cuatro
  // recorridos de la lista entera y cuatro arrays intermedios en CADA render de
  // Mapa: al escribir una letra en el buscador, al abrir el panel, al tocar un
  // pin. Nada de eso tiene que ver con el Resumen.
  //
  // Los puntos donde ya no hay medidor se cuentan aparte de `estado` porque son
  // dos cosas distintas: `estado` es el mapeo, esto es memoria de terreno.
  const resumen = useMemo(() => {
    let localizado = 0, pendiente = 0, perdido = 0, revision = 0
    let confirmados = 0, propuestos = 0
    for (const m of medidores) {
      if (m.estado === 'localizado') localizado++
      else if (m.estado === 'pendiente') pendiente++
      else if (m.estado === 'perdido') perdido++
      else if (m.estado === 'revision') revision++

      if (!m.marcaPermanente) continue
      if (m.marcaPermanente.situacion === 'confirmada') confirmados++
      else propuestos++
    }
    return {
      localizado, pendiente, perdido, revision,
      confirmados, propuestos, marcados: confirmados + propuestos,
    }
  }, [medidores])

  // Las vistas van en DOS memos y no en uno, y la razón es el rendimiento al
  // tocar un pin.
  //
  // `seleccionadoId` entra en vistaDeGrupo por una sola cosa: que un medidor
  // elegido a propósito se vea aunque TOES ya lo haya tomado (si no, buscar una
  // instalación tomada no mostraría nada y el buscador parecería roto). Pero
  // tenerlo en las dependencias del memo significaba recalcular los 1.765
  // grupos en cada toque — cada uno con su Map y sus arrays nuevos — y, peor,
  // devolver objetos `vista` con identidad nueva para TODOS. Eso rompía el memo
  // de cada MarcadorGrupo montado, que es justo lo que el culling y la
  // memoización fueron a arreglar.
  //
  // Ahora la base no sabe de la selección, así que conserva su identidad, y
  // solo se recalcula el grupo donde está el medidor elegido.
  const vistasBase = useMemo(
    () => grupos.map((g) => vistaDeGrupo(
      g.medidores, toes.indice, toes.config, iconos, toes.verTomados, null, toes.soloRepaso
    )),
    [grupos, toes.indice, toes.config, toes.verTomados, toes.soloRepaso]
  )

  const vistas = useMemo(() => {
    if (!seleccionadoId) return vistasBase
    const i = grupos.findIndex((g) => g.medidores.some((m) => m._id === seleccionadoId))
    // El elegido puede no estar en lo cargado: se busca por instalación en otra
    // UL y el pin todavía no llegó. Ahí no hay nada que recalcular.
    if (i === -1) return vistasBase
    const copia = vistasBase.slice()
    copia[i] = vistaDeGrupo(
      grupos[i].medidores, toes.indice, toes.config, iconos, toes.verTomados, seleccionadoId,
      toes.soloRepaso
    )
    return copia
  }, [vistasBase, grupos, toes.indice, toes.config, toes.verTomados, seleccionadoId, toes.soloRepaso])

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
  // `alAbrir` separa el arranque de una recarga con la app abierta (importar
  // un KML, eliminar una ruta): solo al arrancar se restaura lo guardado; si
  // no, se pisaba lo que el lector marcó durante la sesión.
  async function cargarUls({ alAbrir = false } = {}) {
    try {
      const { data } = await api.get('/medidores/uls')
      setUls(data.uls)
      // La regla de qué se restaura vive en utils/ulsActivas.js, con tests:
      // descartar una UL que ya no existe falla en silencio (el mapa queda
      // vacío sin decir por qué).
      if (alAbrir) {
        const restauradas = ulsARestaurar(ulsIniciales, data.uls)
        if (restauradas.length > 0) setUlsActivas(restauradas)
      } else {
        setUlsActivas((prev) => ulsTrasRecargar(prev, data.uls))
      }
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

  useEffect(() => { cargarUls({ alAbrir: true }) }, [])
  useEffect(() => {
    if (ulsActivas.length > 0) cargarMedidores()
    else setMedidores([])
    // cargarMedidores ya es estable (useCallback sobre [ulsActivas]), así que
    // declararlo no agrega vueltas: cambia exactamente cuando cambia ulsActivas.
  }, [ulsActivas, cargarMedidores])

  // Guardar lo que esté marcado. El guard de `uls` evita el momento del
  // montaje, cuando todavía no llegó la lista y ulsActivas es [].
  useEffect(() => {
    if (!uls.length) return
    try { localStorage.setItem(CLAVE_ULS, JSON.stringify(ulsActivas)) } catch { /* sin storage, da igual */ }
  }, [ulsActivas, uls])

  // Lo que TOES dice sobre los puntos donde ya no hay medidor se manda al
  // servidor, porque la marca tiene que verla el lector del mes siguiente
  // — que puede ser otra persona y otro teléfono.
  useMarcasToes(medidores, toes.indice, toes.config, cargarMedidores)

  function toggleUl(ul) {
    setUlsActivas(prev =>
      prev.includes(ul) ? prev.filter(u => u !== ul) : [...prev, ul]
    )
  }

  async function handleBuscar(e) {
    e.preventDefault()
    const texto = busqueda.trim()
    if (!texto) return

    // Se busca SOLO en las ULs marcadas. Antes, si no aparecía ahí, caía a una
    // búsqueda en todas las rutas y marcaba sola la UL del primer resultado:
    // los "últimos dígitos" casi siempre se repiten en alguna otra ruta, así
    // que el lector terminaba en un medidor ajeno y con otra UL cargada.
    if (ulsActivas.length === 0) {
      alert('Marca primero la UL en la que quieres buscar.')
      return
    }

    // Si es puro número (los últimos 4-5 dígitos del medidor), busco
    // primero dentro de lo que ya está cargado comparando el FINAL del
    // número de instalación — así "1234" encuentra el medidor 103381234 sin
    // ambigüedad con otros números que solo lo contengan en el medio.
    if (/^\d+$/.test(texto)) {
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
      // Si no está en lo cargado igual se pregunta al servidor, restringido a
      // las mismas ULs: la carga trae hasta 500 por UL y puede quedar corta.
    }

    try {
      const params = new URLSearchParams({ q: texto, ul: ulsActivas.join(',') })
      const { data } = await api.get(`/medidores/buscar?${params}`)
      if (data.medidores.length > 0) {
        const m = data.medidores[0]
        if (m.ubicacion?.coordinates) {
          const [lng, lat] = m.ubicacion.coordinates
          setCentroMapa([lat, lng])
        }
        seleccionarMedidor(m._id)
      } else {
        alert(`No se encontró "${texto}" en ${ulsActivas.length === 1 ? 'la UL ' + ulsActivas[0] : 'las ULs marcadas'}.`)
      }
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

  // Mover un pin. Antes la única salida para un punto mal ubicado por la ruta
  // importada era borrarlo y crearlo de nuevo, y con eso se iban su historial
  // y sus fotos. El backend deja la posición anterior en el historial.
  const puedeMover = usuario.rol === 'admin' || usuario.rol === 'supervisor'

  function empezarAMover(medidor) {
    cerrarFormulario()
    setModoAgregar(false)
    setMoviendo(medidor)
  }

  async function moverA([lat, lng], precision) {
    const m = moviendo
    if (!m) return
    const extra = precision ? `\n(precisión del GPS: ±${Math.round(precision)} m)` : ''
    if (!confirm(`¿Mover ${m.instalacion} a este punto?${extra}`)) return
    try {
      await api.patch(`/medidores/${m.instalacion}/ubicacion`, { lat, lng })
      setMoviendo(null)
      await cargarMedidores()
      setCentroMapa([lat, lng])
      seleccionarMedidor(m._id)
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo mover el punto')
    }
  }

  // En terreno lo más preciso suele ser pararse junto al medidor: se toma una
  // sola lectura del GPS, sin dejar el seguimiento prendido.
  function moverAMiGps() {
    if (!navigator.geolocation) return alert('Este dispositivo no tiene GPS disponible')
    navigator.geolocation.getCurrentPosition(
      (pos) => moverA([pos.coords.latitude, pos.coords.longitude], pos.coords.accuracy),
      () => alert('No se pudo obtener la ubicación. Revisa que el GPS esté encendido.'),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }

  // Tocar el mapa con un modo activo: mover tiene prioridad sobre agregar.
  function clickEnMapa(coords) {
    if (moviendo) moverA(coords)
    else abrirFormulario(null, coords)
  }

  // Resolver una marca permanente: confirmarla (el punto queda descartado
  // para los próximos meses), rechazarla (deja constancia de que alguien dijo
  // que sí hay medidor, y evita que el sondeo la reponga) o quitarla del todo.
  const resolverMarca = useCallback(async (instalacion, accion, tipo) => {
    try {
      if (accion === 'quitar') {
        await api.delete(`/medidores/${instalacion}/marca`)
      } else if (accion === 'marcar') {
        // Marcado a mano por un admin o supervisor. Son dos llamadas porque
        // reusa los endpoints que ya existen, y el historial queda honesto:
        // la propuso y la confirmó la misma persona. Es la única vía para
        // "sin empalme", que TOES no puede reportar (su clave 16 está
        // inactiva y va como submenú de la 05).
        await api.post(`/medidores/${instalacion}/marca`, { tipo })
        await api.patch(`/medidores/${instalacion}/marca`, { situacion: 'confirmada' })
      } else {
        await api.patch(`/medidores/${instalacion}/marca`, {
          situacion: accion === 'confirmar' ? 'confirmada' : 'rechazada',
        })
      }
      await cargarMedidores()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo actualizar la marca')
    }
  }, [cargarMedidores])

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

  // Baja con wifi los cuadros del mapa de una ruta, para que en terreno no haya
  // que esperar a Esri. Las coordenadas salen de medidores[].ubicacion, o sea
  // de la base — NUNCA del log de TOES: pedir un tile le manda esa coordenada
  // a Esri, y las del log son datos de clientes que no salen del telefono.
  async function descargarMapaDeRuta(ul) {
    const deLaRuta = medidores.filter((m) => m.unidadDeLectura === ul)
    if (!deLaRuta.length) {
      alert(`No hay medidores cargados de la ruta ${ul}.`)
      return
    }

    const p = presupuestoDeRuta(deLaRuta, capaActiva)
    if (!p.cantidad) {
      alert(`Los medidores de ${ul} no tienen ubicación, así que no hay nada que bajar.`)
      return
    }

    // Se pregunta antes porque son decenas de MB: empezar eso sin avisar, con
    // datos móviles, sería gastarle el plan al lector sin que se entere.
    const recorte = p.truncado
      ? `

Son tantos que solo se bajarán ${p.cantidad} de ${p.totalSinTope}, empezando por los zooms generales.`
      : ''
    const seguir = confirm(
      `¿Descargar el mapa de ${ul} en ${nombreDeCapa(capaActiva)}?

` +
      `≈ ${p.cantidad} cuadros, ~${p.mb} MB.
` +
      `Conviene hacerlo con wifi.${recorte}`
    )
    if (!seguir) return

    setPrecarga({ ul, hechas: 0, total: p.cantidad })
    try {
      const r = await descargarRuta(deLaRuta, capaActiva, (a) => {
        setPrecarga({ ul, hechas: a.hechas, total: a.total, fallidas: a.fallidas })
      })
      setPrecarga({
        ul, hechas: r.hechas, total: r.total, fallidas: r.fallidas,
        mensaje: r.sinEspacio
          // Lo que alcanzó a bajarse queda y sirve: simplemente no está completo.
          ? `Se acabó el espacio del teléfono: quedaron ${r.hechas} de ${r.total}. Lo bajado sirve igual.`
          : `Listo: ${r.hechas} cuadros${r.fallidas ? `, ${r.fallidas} fallaron` : ''}.`,
      })
    } catch (err) {
      setPrecarga({ ul, mensaje: err?.message ?? 'No se pudo descargar el mapa de la ruta' })
    }
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

  const ulsFiltradas = uls.filter((ul) => ul.toLowerCase().includes(filtroUl.toLowerCase()))

  // Una fila del panel de ULs. Es función y no componente porque se usa en
  // las dos vistas del desplegable (cerrado: solo las marcadas; abierto: todas).
  function filaUl(ul) {
    return (
      <div key={ul}>
        <div className="d-flex align-items-center justify-content-between mb-1">
          <div className="form-check" style={{ flex: 1, minWidth: 0 }}>
            <input className="form-check-input" type="checkbox"
              id={`ul-${ul}`} checked={ulsActivas.includes(ul)}
              onChange={() => toggleUl(ul)} />
            <label className="form-check-label text-truncate d-block" htmlFor={`ul-${ul}`}
              style={{ fontSize: '0.85rem', cursor: 'pointer' }}>{ul}</label>
          </div>
          {/* Solo para las rutas marcadas: los medidores de una
              UL sin marcar no están cargados, así que no se sabe
              qué cuadros bajar. Y solo en el APK, que es donde
              tiene sentido salir a terreno sin señal. */}
          {puedePrecargar && ulsActivas.includes(ul) && (
            <button className="btn btn-sm p-0 px-1" title="Descargar el mapa de esta ruta (usar con wifi)"
              onClick={() => descargarMapaDeRuta(ul)}
              disabled={Boolean(precarga) && !precarga.mensaje}
              style={{ fontSize: '0.85rem' }}>
              🗺️
            </button>
          )}
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

        {precarga?.ul === ul && (
          <div
            onClick={() => precarga.mensaje && setPrecarga(null)}
            title={precarga.mensaje ? 'Tocar para ocultar' : undefined}
            style={{
              fontSize: '0.72rem', color: '#4a5568',
              margin: '-0.2rem 0 0.4rem 1.5rem',
              cursor: precarga.mensaje ? 'pointer' : 'default',
            }}>
            {precarga.mensaje ?? `Bajando el mapa… ${precarga.hechas} / ${precarga.total}`}
          </div>
        )}
      </div>
    )
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
              {/* Desplegable: con 200+ rutas la lista abierta ocupaba todo el
                  panel y empujaba TOES y el Resumen fuera de la pantalla. Cerrado
                  muestra solo las ULs marcadas, que son con las que se trabaja
                  en el día y las que tienen los botones de mapa y exportar. */}
              <button type="button" onClick={() => setListaUlsAbierta((a) => !a)}
                aria-expanded={listaUlsAbierta}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'none', border: 'none', padding: 0, textAlign: 'left',
                  fontWeight: 'bold', fontSize: '0.85rem', color: '#2b6cb0',
                }}>
                <span style={{ flex: 1 }}>📋 Unidades de Lectura</span>
                <span style={{ fontWeight: 'normal', fontSize: '0.75rem', color: '#718096' }}>
                  {ulsActivas.length === 0 ? 'ninguna' : `${ulsActivas.length} marcada${ulsActivas.length > 1 ? 's' : ''}`}
                </span>
                <span>{listaUlsAbierta ? '▴' : '▾'}</span>
              </button>

              {!listaUlsAbierta && (
                <div style={{ marginTop: '0.5rem' }}>
                  {ulsActivas.length === 0
                    ? (
                      <button type="button" className="btn btn-outline-primary btn-sm w-100"
                        onClick={() => setListaUlsAbierta(true)}>
                        Elegir UL
                      </button>
                    )
                    : ulsActivas.map(filaUl)}
                </div>
              )}

              {listaUlsAbierta && (
                <div style={{ marginTop: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    placeholder="Filtrar UL..."
                    value={filtroUl}
                    onChange={(e) => setFiltroUl(e.target.value)}
                  />

                  <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                    {ulsFiltradas.map(filaUl)}
                    {ulsFiltradas.length === 0 && (
                      <p className="text-muted" style={{ fontSize: '0.78rem' }}>Sin resultados</p>
                    )}
                  </div>

                  <button type="button" className="btn btn-primary btn-sm w-100 mt-2"
                    onClick={() => { setListaUlsAbierta(false); setFiltroUl('') }}>
                    Listo
                  </button>
                </div>
              )}
            </div>

            <PanelToes toes={toes} medidores={medidores} ulsActivas={ulsActivas} />

            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
              <p style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#2b6cb0', margin: '0 0 0.5rem' }}>
                📊 Resumen
              </p>
              <div style={{ fontSize: '0.82rem' }}>
                <div>Total: <strong>{medidores.length}</strong></div>
                <div style={{ color: 'green' }}>✅ Localizados: <strong>{resumen.localizado}</strong></div>
                <div style={{ color: '#2196F3' }}>🔵 Pendientes: <strong>{resumen.pendiente}</strong></div>
                <div style={{ color: 'red' }}>❌ Perdidos: <strong>{resumen.perdido}</strong></div>
                <div style={{ color: 'orange' }}>⚠️ Revisión: <strong>{resumen.revision}</strong></div>
                {resumen.marcados > 0 && (
                  <div style={{ color: '#A1887F', marginTop: '0.2rem' }}>
                    🚫 Sin medidor en terreno: <strong>{resumen.confirmados}</strong>
                    {resumen.propuestos > 0 && (
                      <span style={{ color: '#718096' }}> (+{resumen.propuestos} por confirmar)</span>
                    )}
                  </div>
                )}
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
                onClick={() => { setMoviendo(null); setModoAgregar(!modoAgregar) }}>
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

            <PieDelPanel />
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

          {/* Centrar en mí. Va fuera de los motores para que sea el mismo
              botón en los dos; si el punto azul está apagado lo prende, y la
              primera lectura del GPS centra sola. */}
          <button
            type="button"
            title="Centrar en mi ubicación"
            aria-label="Centrar en mi ubicación"
            onClick={() => {
              if (!miUbicacionActiva) setMiUbicacionActiva(true)
              setPedidoCentrar((n) => n + 1)
            }}
            style={{
              position: 'absolute', right: '0.75rem', bottom: '4.5rem', zIndex: 1000,
              width: '48px', height: '48px', borderRadius: '50%',
              border: 'none', backgroundColor: 'white', fontSize: '1.4rem',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              color: miUbicacionActiva ? '#1a73e8' : '#4a5568',
            }}>
            ◎
          </button>

          {/* Aviso del repaso, sobre el mapa y no solo en el panel. El
              interruptor vive en el bloque de TOES, que se esconde cuando
              ninguna UL marcada tiene lecturas: pasó en terreno que quedó
              prendido, se marcó una ruta recién importada (sin nada en TOES)
              y el mapa salió vacío, sin forma de ver por qué ni de apagarlo. */}
          {toes.soloRepaso && !moviendo && !modoAgregar && (
            <div style={{
              position: 'absolute', top: '3.5rem', left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000, backgroundColor: '#c05621',
              color: 'white', padding: '0.3rem 0.4rem 0.3rem 0.8rem',
              borderRadius: '20px', fontSize: '0.8rem', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              Solo casas cerradas
              <button className="btn btn-light btn-sm py-0"
                onClick={() => toes.setSoloRepaso(false)}>
                Ver todo
              </button>
            </div>
          )}

          {moviendo && (
            <div style={{
              position: 'absolute', top: '3.5rem', left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000, backgroundColor: '#2c5282',
              color: 'white', padding: '0.4rem 0.8rem',
              borderRadius: '12px', fontSize: '0.8rem',
              textAlign: 'center', maxWidth: 'calc(100% - 32px)',
            }}>
              <div>📍 Toca la nueva ubicación de <b>{moviendo.instalacion}</b></div>
              <div className="d-flex gap-2 justify-content-center mt-1">
                <button className="btn btn-light btn-sm py-0" onClick={moverAMiGps}>
                  Usar mi GPS
                </button>
                <button className="btn btn-outline-light btn-sm py-0" onClick={() => setMoviendo(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {modoAgregar && !moviendo && (
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
          {MOTOR_GL ? (
            <MapaGL
              grupos={grupos}
              vistas={vistas}
              seleccionadoId={seleccionadoId}
              grupoSeleccionado={grupoSeleccionado}
              pulsoSeleccion={pulsoSeleccion}
              esMobil={esMobil}
              rolUsuario={usuario.rol}
              toesConfig={toes.config}
              onElegir={seleccionarMedidor}
              onElegirGrupo={elegirGrupo}
              onEditar={abrirFormulario}
              onEliminar={handleEliminar}
              onFotoSubida={cargarMedidores}
              onResolverMarca={resolverMarca}
              capa={capaActiva}
              onCambioCapa={cambiarCapa}
              centroMapa={centroMapa}
              modoAgregar={modoAgregar || !!moviendo}
              onClickMapa={clickEnMapa}
              nuevoPunto={nuevoPunto}
              miUbicacionActiva={miUbicacionActiva}
              onErrorUbicacion={avisarErrorUbicacion}
              pedidoCentrar={pedidoCentrar}
            />
          ) : (
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
                  url={URL_CALLES}
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

                      Por si algún sector raro no tiene ni z18 está la foto de
                      respaldo hasta z15, que existe en todo Chile. Pero ahora
                      se monta SOLO cuando la foto buena llegó a fallar.

                      Antes estaba siempre, y eso costaba una rejilla entera de
                      <img> del DOM, sus peticiones y su parte de las 1.500
                      entradas del caché — midiendo el caché del teléfono, cada
                      capa de referencia pesaba tanto como la foto misma. Y el
                      propio README ya había verificado que a z18 la foto buena
                      carga sin UN SOLO fallo en toda la zona: o sea que el
                      respaldo era peso muerto el 100 % del tiempo en el área
                      medida.

                      Lo que se paga: donde la foto buena sí falle, ahora se ve
                      el cuadro gris un instante hasta que el respaldo monta y
                      carga. Y una vez montado se queda — también si el
                      tileerror vino de quedarse sin señal y no de un sector sin
                      foto. Eso es exactamente lo que hacía antes; lo que se
                      gana es el caso normal, que es el que corre todo el día.

                      El orden lo fija zIndex y NO el orden de montaje: si no,
                      el respaldo entraría encima de la foto buena al montarse
                      tarde y la taparía justo donde se la necesita. */}
                  {fotoFallo && (
                    <TileLayer
                      url={URL_FOTO_RESPALDO}
                      maxNativeZoom={15}
                      maxZoom={18}
                      updateWhenIdle={true}
                      zIndex={1}
                      crossOrigin="anonymous"
                    />
                  )}
                  <TileLayer
                    attribution='Imágenes &copy; Esri, Maxar, Earthstar Geographics'
                    url={URL_FOTO}
                    maxZoom={18}
                    updateWhenIdle={true}
                    zIndex={2}
                    crossOrigin="anonymous"
                    eventHandlers={manejadoresFoto}
                  />
                  <TileLayer
                    url={URL_CAMINOS}
                    maxZoom={18}
                    updateWhenIdle={true}
                    zIndex={3}
                    crossOrigin="anonymous"
                  />
                </LayerGroup>
              </LayersControl.BaseLayer>
            </LayersControl>
            <RecordarCapa onCambio={setCapaActiva} />
            <RegistrarParaMedicion grupos={grupos} />
            {centroMapa && <CentrarMapa coords={centroMapa} />}
            <InvalidarTamano />
            <CapturarClick
              onClickMapa={clickEnMapa}
              modoAgregar={modoAgregar || !!moviendo}
            />
            <MiUbicacion
              activo={miUbicacionActiva}
              // `fatal` es solo el permiso denegado. Perder señal un rato es
              // normal en terreno: ahí se avisa pero el seguimiento sigue
              // prendido, para no obligar a volver a tocar el botón cada vez
              // que el GPS se cae bajo unos árboles.
              onError={(msg, fatal) => { alert(msg); if (fatal) setMiUbicacionActiva(false) }}
              pedidoCentrar={pedidoCentrar}
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
              onResolverMarca={resolverMarca}
            />
          </MapContainer>
          )}
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
              onMover={puedeMover ? empezarAMover : undefined}
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
            onMover={puedeMover ? empezarAMover : undefined}
          />
        </Modal.Body>
      </Modal>
    </div>
  )
}
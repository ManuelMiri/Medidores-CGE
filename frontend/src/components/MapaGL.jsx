// src/components/MapaGL.jsx
// El mapa con el motor sobre GPU (MapLibre GL).
//
// POR QUÉ. Medido en el teléfono (A36, z16, misma zona, misma UL, con la vista
// anclada para que las corridas sean comparables):
//
//   p50 por frame     sin pines   con ~130 pines   costo de los pines
//   Leaflet            22 ms       41 ms            +19 ms
//   MapLibre           13 ms       13 ms              0 ms
//
// En Leaflet cada pin es un <img> que el navegador reposiciona uno por uno, y
// con ~130 en pantalla solos se comen más que el frame entero (16,7 ms a
// 60 Hz). Acá son sprites de una capa `symbol`: los dibuja la GPU de una
// pasada y no cuestan nada medible. El p95 pasa de 57 ms a 16 ms.
//
// NO cambia el aspecto, y es un requisito: la gota con el contador rojo es la
// identidad del mapa. Se usan los MISMOS PNG que iconosMapa.js, con el mismo
// anclaje abajo, y el contador se arma con un círculo y un texto en las
// posiciones que index.css les da a los marcadores de Leaflet.
//
// El contenido de los popups es el MISMO componente que usa la capa de Leaflet
// (DetalleMedidor.jsx). Lo único propio de cada motor es cómo se abre y se
// cierra la ventanita.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// maplibre-gl 6 ya no trae export default en su build ESM: hay que pedir los
// nombres sueltos. Con el default el build muere en MISSING_EXPORT.
import { Map as MapaLibre, Popup, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// El worker, con la URL que le da Vite al empaquetarlo.
//
// Sin esto el mapa se ve pero NO dibuja nada vectorial, y encima en silencio:
// la foto satelital y los caminos aparecen (son raster y no pasan por el
// worker) pero la fuente GeoJSON de los pines se queda en cero features, sin un
// solo error en la consola ni en el evento `error` del mapa.
//
// El motivo: maplibre-gl 6 carga su worker de un archivo aparte,
// `maplibre-gl-worker.mjs`, resolviéndolo relativo a la URL de su propio
// módulo. Al bundlear, esa URL pasa a ser /assets/index-<hash>.js, así que el
// worker se busca en /assets/maplibre-gl-worker.mjs — un archivo que no existe,
// porque Vite no tiene cómo saber que hace falta. Con ?url se emite como asset
// y se le dice a maplibre dónde quedó. El worker no importa nada, así que
// publicarlo suelto alcanza.
import urlDelWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { ContenidoPopup, DetalleMedidor } from './DetalleMedidor'
import { URL_CALLES, URL_FOTO, URL_FOTO_RESPALDO, URL_CAMINOS } from '../config/capasMapa'
import { medicionActiva, registrarMapaParaMedicion } from '../utils/medirFluidez'
import { useMiUbicacionGL } from '../hooks/useMiUbicacionGL'
import { pinDeColor, nombreDePinDeColor, pinConContador, nombreConContador } from '../utils/pinDeColor'
import pinVerde2x from '../assets/pines/marker-icon-2x-green.png'
import pinRojo2x from '../assets/pines/marker-icon-2x-red.png'
import pinAzul2x from '../assets/pines/marker-icon-2x-blue.png'
import pinNaranja2x from '../assets/pines/marker-icon-2x-orange.png'
import pinMorado2x from '../assets/pines/marker-icon-2x-violet.png'
import pinDorado2x from '../assets/pines/marker-icon-2x-gold.png'

setWorkerUrl(urlDelWorker)

const CENTRO_MAULE = [-71.65, -35.5] // ojo: MapLibre usa [lng, lat]
const ZOOM_MAXIMO = 18

const PINES = {
  localizado: pinVerde2x,
  perdido: pinRojo2x,
  pendiente: pinAzul2x,
  revision: pinNaranja2x,
  nuevo: pinMorado2x,
  seleccionado: pinDorado2x,
}

// Los PNG son los @2x (50x82) y se declaran con pixelRatio 2, así que en
// pantalla miden los mismos 25x41 que en Leaflet.
const RATIO_DE_LOS_PNG = 2

const FUENTE = 'medidores'
const CAPA_PINES = 'pines'

// ---------------------------------------------------------------- el estilo

function fuentesYCapas(capa, conRespaldo) {
  if (capa !== 'satelite') {
    return {
      sources: {
        calles: {
          type: 'raster', tiles: [URL_CALLES], tileSize: 256, maxzoom: ZOOM_MAXIMO,
          attribution: '&copy; OpenStreetMap',
        },
      },
      layers: [{ id: 'calles', type: 'raster', source: 'calles' }],
    }
  }

  // La foto de respaldo (z15) solo entra si la buena llegó a fallar. Estaba
  // siempre y es una rejilla entera de tiles de más: midiendo el caché del
  // teléfono, cada capa pesaba tanto como la foto misma, y el README ya había
  // verificado que a z18 la buena carga sin un solo fallo en toda la zona. Se
  // monta tarde para conservar la red de seguridad sin pagarla todo el día.
  const sources = {
    foto: {
      type: 'raster', tiles: [URL_FOTO], tileSize: 256, maxzoom: ZOOM_MAXIMO,
      attribution: 'Imágenes &copy; Esri, Maxar, Earthstar Geographics',
    },
    caminos: { type: 'raster', tiles: [URL_CAMINOS], tileSize: 256, maxzoom: ZOOM_MAXIMO },
  }
  const layers = []

  if (conRespaldo) {
    // maxzoom 15 hace que MapLibre sobre-escale los mismos tiles más arriba,
    // igual que maxNativeZoom en Leaflet.
    sources.fotoRespaldo = { type: 'raster', tiles: [URL_FOTO_RESPALDO], tileSize: 256, maxzoom: 15 }
    layers.push({ id: 'fotoRespaldo', type: 'raster', source: 'fotoRespaldo' })
  }
  layers.push({ id: 'foto', type: 'raster', source: 'foto' })
  layers.push({ id: 'caminos', type: 'raster', source: 'caminos' })
  return { sources, layers }
}

function estiloDeCapas(capa, conRespaldo) {
  const { sources, layers } = fuentesYCapas(capa, conRespaldo)
  return {
    version: 8,
    // Sin `glyphs` a propósito. El único texto del mapa era el número del
    // contador, y ahora va compuesto dentro de la imagen del pin (ver
    // utils/pinDeColor.js). Declarar glyphs significaría que MapLibre pida
    // archivos de fuente por red para que el mapa se vea completo — y depender
    // de un host ajeno para eso es justo lo que ya pasó con CARTO.
    sources,
    layers,
  }
}

/** Los grupos, como GeoJSON para la fuente del mapa. */
function aGeoJson(grupos, vistas, seleccionadoId, grupoSeleccionado) {
  const features = []
  for (let i = 0; i < grupos.length; i++) {
    const vista = vistas[i]
    if (vista.oculto) continue

    const visibles = vista.visibles
    const elegido = seleccionadoId ? visibles.some((m) => m._id === seleccionadoId) : false
    const idGrupo = visibles.map((m) => m._id).join('-')
    const marcado = elegido || grupoSeleccionado === idGrupo

    features.push({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [grupos[i].position[1], grupos[i].position[0]] },
      properties: {
        // El índice del grupo viaja en las propiedades: es lo que deja
        // encontrar el grupo original al tocar un pin, sin buscar por
        // coordenada.
        indice: i,
        // Dorado si está elegido. Si no y el punto tiene color propio (la
        // clave con que TOES lo tomó, o el tipo de marca permanente), va el
        // pin de ese color; en último caso, el del estado de mapeo. Es el
        // mismo orden de prioridades que aplica la capa de Leaflet.
        icono: iconoDe(vista, marcado),
        // `marcado` aparte del icono: el orden de dibujado lo decide esta
        // propiedad, no el nombre de la imagen, que ahora lleva el contador.
        marcado,
        opacidad: vista.opacidad ?? 1,
        cuenta: visibles.length,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

// ------------------------------------------------------------- el componente

export default function MapaGL({
  grupos, vistas, seleccionadoId, grupoSeleccionado, pulsoSeleccion,
  esMobil, rolUsuario, toesConfig,
  onElegir, onElegirGrupo, onEditar, onEliminar, onFotoSubida, onResolverMarca,
  capa, onCambioCapa,
  centroMapa, modoAgregar, onClickMapa, nuevoPunto,
  miUbicacionActiva, onErrorUbicacion,
}) {
  const contenedor = useRef(null)
  const mapaRef = useRef(null)
  const listoRef = useRef(false)
  const [listo, setListo] = useState(false)
  const [conRespaldo, setConRespaldo] = useState(false)
  // Qué popup está abierto: el índice del grupo. Null es ninguno.
  const [abierto, setAbierto] = useState(null)

  // Siempre lo último, para los handlers del mapa y para el primer dibujado:
  // el mapa tarda en estar listo y mientras tanto los datos pueden cambiar.
  const datosRef = useRef(null)
  datosRef.current = {
    grupos, vistas, seleccionadoId, grupoSeleccionado,
    modoAgregar, onClickMapa, onElegir, onElegirGrupo,
  }

  const geojson = useMemo(
    () => aGeoJson(grupos, vistas, seleccionadoId, grupoSeleccionado),
    [grupos, vistas, seleccionadoId, grupoSeleccionado]
  )

  // El div del popup se crea una vez y se reusa: React dibuja adentro con un
  // portal y MapLibre solo lo monta y lo desmonta.
  const divPopup = useRef(null)
  if (!divPopup.current && typeof document !== 'undefined') {
    divPopup.current = document.createElement('div')
  }
  const popupRef = useRef(null)

  // ------------------------------------------------------------- montaje
  useEffect(() => {
    if (mapaRef.current) return

    const mapa = new MapaLibre({
      container: contenedor.current,
      style: estiloDeCapas(capa, false),
      center: CENTRO_MAULE,
      zoom: 13,
      maxZoom: ZOOM_MAXIMO,
      // El mapa SÍ se puede rotar, con dos dedos.
      //
      // En Leaflet no se podía: rotar era un truco de CSS sobre el contenedor y
      // ahí sí rompía el clic para colocar un punto, que es la función central
      // de la app. Acá la rotación es una propiedad de la cámara, así que
      // e.lngLat sale bien a cualquier ángulo y los pines, el contador y el
      // punto azul se quedan derechos solos (van anclados al viewport).
      //
      // Sirve de verdad en terreno: poder girar el mapa para que apunte hacia
      // donde uno camina es la diferencia entre leer el mapa y traducirlo
      // mentalmente, sobre todo en una ruta rural donde no hay esquinas que
      // sirvan de referencia.
      dragRotate: true,
      // La inclinación sí queda apagada. Sobre foto satelital una vista en
      // perspectiva desubica más de lo que ayuda, y cambiaría la escala dentro
      // de la misma pantalla: dos pines igual de separados se verían a
      // distancias distintas según dónde caigan.
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      attributionControl: { compact: true },
    })
    mapaRef.current = mapa
    // La brújula NO es un adorno: es la única forma de volver al norte sin
    // pelearse con los dedos. Sin ella, un mapa que quedó torcido por accidente
    // se queda torcido.
    mapa.addControl(new NavigationControl({ showCompass: true, visualizePitch: false }), 'top-left')

    // Solo mientras se compara contra Leaflet: deja el mapa a mano para poder
    // interrogarlo desde la consola del WebView sin recompilar.
    if (medicionActiva()) window.__mapaGL = mapa

    // Si la foto buena falla, recién ahí entra la de respaldo.
    mapa.on('error', (e) => {
      if (e?.sourceId === 'foto') setConRespaldo(true)
    })

    mapa.on('load', async () => {
      await cargarIconos(mapa)
      registrarImagenes(mapa, datosRef.current.vistas)
      agregarCapaDePines(mapa, datosRef.current)

      mapa.on('click', CAPA_PINES, (e) => {
        const f = e.features?.[0]
        if (f) manejarToqueDePin(Number(f.properties.indice), datosRef.current, setAbierto)
      })

      // Tocar el mapa fuera de un pin: colocar un punto nuevo si está el modo,
      // y si no, cerrar el popup que hubiera abierto.
      mapa.on('click', (e) => {
        const d = datosRef.current
        if (mapa.queryRenderedFeatures(e.point, { layers: [CAPA_PINES] }).length) return
        if (d.modoAgregar) d.onClickMapa?.([e.lngLat.lat, e.lngLat.lng])
        else setAbierto(null)
      })

      listoRef.current = true
      setListo(true)

      // Los datos se vuelven a aplicar ACÁ, y no solo en el efecto de abajo,
      // por una carrera que deja el mapa vacío para siempre: este handler es
      // asíncrono porque carga los PNG, y si los medidores llegan mientras
      // tanto, el efecto corre con listo todavía en false y se salta. Como
      // `grupos` no vuelve a cambiar, la fuente se queda en cero features. Pasó
      // de verdad, y se ve como un mapa sin un solo pin y sin un solo error.
      mapa.getSource(FUENTE)?.setData(datosActuales(datosRef.current))
    })

    return () => {
      listoRef.current = false
      popupRef.current?.remove()
      popupRef.current = null
      mapa.remove()
      mapaRef.current = null
    }
    // Solo al montar: la capa inicial se lee una vez y los cambios van por su
    // propio efecto. Meter `capa` acá recrearía el mapa entero al cambiarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------- los datos
  useEffect(() => {
    const mapa = mapaRef.current
    if (!listo || !mapa) return
    // Los pines de color se registran ANTES de mandar los datos: si el estilo
    // pide una imagen que no existe, MapLibre no dibuja ese pin y además lo
    // avisa por consola en cada frame. Son pocos y se generan una sola vez
    // por color, no por punto.
    registrarImagenes(mapa, vistas)
    mapa.getSource(FUENTE)?.setData(geojson)
  }, [geojson, vistas, listo])

  // ------------------------------------------------- cambio de capa base
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo) return
    // setStyle se lleva por delante las fuentes y capas propias, así que hay
    // que volver a ponerlas cuando el estilo nuevo terminó de cargar.
    mapa.setStyle(estiloDeCapas(capa, conRespaldo))
    mapa.once('styledata', () => {
      if (mapa.getSource(FUENTE)) return
      cargarIconos(mapa).then(() => {
        // setStyle también se lleva las imágenes, así que los colores hay que
        // volver a registrarlos.
        registrarImagenes(mapa, datosRef.current.vistas)
        agregarCapaDePines(mapa, datosRef.current)
        mapa.getSource(FUENTE)?.setData(datosActuales(datosRef.current))
      })
    })
  }, [capa, conRespaldo, listo])

  // --------------------------------------------- centrar desde el buscador
  useEffect(() => {
    if (!listo || !centroMapa) return
    mapaRef.current?.easeTo({ center: [centroMapa[1], centroMapa[0]], zoom: 17, duration: 400 })
  }, [centroMapa, listo])

  // ------------------------------------- el popup del medidor seleccionado
  //
  // Al buscar una instalación se la selecciona antes de que el mapa termine de
  // moverse, y es la selección lo que tiene que abrir el popup: si no, buscar
  // un medidor no mostraría nada y el buscador parecería roto.
  //
  // El ref es lo que hace que abra UNA vez por selección. Sin él, el efecto se
  // vuelve a disparar con cada cambio de `vistas` —y cerrar el popup no
  // deselecciona el medidor— así que la ventana se cerraba y volvía a aparecer
  // sola en cuanto algo tocaba los datos: el sondeo de TOES, una marca
  // propuesta, una foto subida. Se veía como que el popup "no se cierra del
  // todo", y es lo que reportó el lector.
  //
  // Lo que se recuerda es el PULSO y no el id. Buscar dos veces seguidas la
  // misma instalación no cambia el id, pero sí es una petición nueva de
  // "mostrame este" y el popup tiene que volver a abrirse; con el id el
  // segundo intento quedaba mudo.
  //
  // `vistas` tiene que seguir en las dependencias: al buscar una instalación de
  // una UL que no estaba marcada, el medidor se elige ANTES de que su pin
  // exista, y este efecto es el que lo abre cuando llega.
  const abiertoPara = useRef(null)
  useEffect(() => {
    if (!listo) return
    if (!seleccionadoId) {
      abiertoPara.current = null
      return
    }
    if (abiertoPara.current === pulsoSeleccion) return
    const i = vistas.findIndex((v) => !v.oculto && v.visibles.some((m) => m._id === seleccionadoId))
    if (i === -1) return
    abiertoPara.current = pulsoSeleccion
    setAbierto(i)
  }, [seleccionadoId, pulsoSeleccion, vistas, listo])

  // --------------------------------------------------- montar/quitar popup
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo) return

    if (abierto == null || !grupos[abierto]) {
      popupRef.current?.remove()
      popupRef.current = null
      return
    }

    const g = grupos[abierto]
    if (!popupRef.current) {
      popupRef.current = new Popup({
        closeButton: esMobil,
        // Lo cierra el handler del mapa, que sí distingue un pin del fondo.
        closeOnClick: false,
        maxWidth: '260px',
        // En escritorio el popup sale a la DERECHA del pin para no tapar los
        // de arriba; en el celular no hay espacio al lado y va arriba, como
        // siempre. En Leaflet esto era la clase popup-derecha de index.css.
        anchor: esMobil ? 'bottom' : 'left',
        offset: esMobil ? [0, -38] : [16, -20],
      })
      popupRef.current.on('close', () => setAbierto(null))
    }
    const lngLat = [g.position[1], g.position[0]]
    popupRef.current
      .setLngLat(lngLat)
      .setDOMContent(divPopup.current)
      .addTo(mapa)

    // Correr el mapa lo justo para que el popup entre.
    //
    // Leaflet lo hacía solo (autoPanPadding); MapLibre no tiene equivalente, y
    // sin esto la ficha de un pin que esté arriba en la pantalla queda cortada
    // contra la barra azul y no se llega a los botones. Se mueve lo MÍNIMO y no
    // se centra el punto, que es lo que hacía Leaflet: mover de más desubica al
    // lector, que estaba mirando otra parte del mapa.
    //
    // Si el mapa viene moviéndose —el buscador acaba de centrar el medidor—
    // hay que esperar a que termine. Un panBy en medio de un easeTo lo CANCELA,
    // y el mapa se queda a mitad de camino: buscar una instalación dejaba el
    // zoom en 16,08 en vez de los 17 que pidió el buscador.
    const acomodar = () => requestAnimationFrame(() => {
      const el = popupRef.current?.getElement()
      if (!el) return
      const caja = el.getBoundingClientRect()
      const mapaCaja = mapa.getCanvas().getBoundingClientRect()
      const MARGEN = 10
      // Arriba hay que dejar más: el buscador FLOTA sobre el mapa, así que el
      // borde del canvas no es el borde libre. Sin esto el popup entra en
      // pantalla pero con su título y su ✕ escondidos detrás del buscador.
      const MARGEN_ARRIBA = 58

      // panBy mueve la CÁMARA, así que para bajar el popup en pantalla hay que
      // pasarle el corrimiento en negativo.
      let dx = 0
      let dy = 0
      if (caja.top < mapaCaja.top + MARGEN_ARRIBA) dy = -(mapaCaja.top + MARGEN_ARRIBA - caja.top)
      if (caja.left < mapaCaja.left + MARGEN) dx = -(mapaCaja.left + MARGEN - caja.left)
      else if (caja.right > mapaCaja.right - MARGEN) dx = caja.right - (mapaCaja.right - MARGEN)

      if (dx || dy) mapa.panBy([dx, dy], { duration: 200 })
    })

    if (mapa.isMoving()) mapa.once('moveend', acomodar)
    else acomodar()
  }, [abierto, grupos, esMobil, listo])

  // ------------------------------------------------- el punto nuevo a colocar
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo) return
    const datos = {
      type: 'FeatureCollection',
      features: nuevoPunto
        ? [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [nuevoPunto[1], nuevoPunto[0]] },
            properties: {},
          }]
        : [],
    }
    const fuente = mapa.getSource('puntoNuevo')
    if (fuente) { fuente.setData(datos); return }

    mapa.addSource('puntoNuevo', { type: 'geojson', data: datos })
    mapa.addLayer({
      id: 'puntoNuevo',
      type: 'symbol',
      source: 'puntoNuevo',
      layout: {
        'icon-image': 'nuevo', 'icon-anchor': 'bottom',
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      },
    })
  }, [nuevoPunto, listo, capa])

  // El cursor avisa que el mapa está esperando un toque para colocar el punto.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listo) return
    mapa.getCanvas().style.cursor = modoAgregar ? 'crosshair' : ''
  }, [modoAgregar, listo])

  // ---------------------------------------------------- tamaño del contenedor
  //
  // Misma trampa que en Leaflet: el mapa mide su contenedor al montar, y si
  // después cambia de tamaño —se muestra u oculta el panel lateral, se rota el
  // teléfono, o el navegador esconde la barra de direcciones al hacer scroll,
  // algo que en Android pasa todo el tiempo— sigue dibujando para el tamaño
  // viejo y el resto queda vacío. MapLibre mira el resize de la ventana, pero
  // el panel lateral cambia el ancho del div SIN que la ventana cambie.
  useEffect(() => {
    const mapa = mapaRef.current
    const div = contenedor.current
    if (!mapa || !div || !listo) return

    const recalcular = () => mapa.resize()
    const observador = new ResizeObserver(recalcular)
    observador.observe(div)
    // orientationchange cubre rotar el teléfono, que a veces el ResizeObserver
    // detecta con retraso.
    window.addEventListener('orientationchange', recalcular)

    return () => {
      observador.disconnect()
      window.removeEventListener('orientationchange', recalcular)
    }
  }, [listo])

  // --------------------------------------------------------- mi ubicación
  useMiUbicacionGL(listo ? mapaRef.current : null, miUbicacionActiva, onErrorUbicacion)

  // ------------------------------------------------------------- medición
  useEffect(() => {
    if (!medicionActiva() || !listo) return
    const mapa = mapaRef.current
    if (!mapa) return

    const vista = () => {
      const c = mapa.getCenter()
      return { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), zoom: +mapa.getZoom().toFixed(2) }
    }

    registrarMapaParaMedicion({
      motor: 'maplibre',
      irA: (lat, lng, zoom) => { mapa.jumpTo({ center: [lng, lat], zoom }); return vista() },
      irAPines: (zoom) => {
        const gs = datosRef.current.grupos
        if (!gs.length) return null
        let lat = 0
        let lng = 0
        for (const g of gs) { lat += g.position[0]; lng += g.position[1] }
        mapa.jumpTo({ center: [lng / gs.length, lat / gs.length], zoom })
        return vista()
      },
      vista,
    })
    return () => registrarMapaParaMedicion(null)
  }, [listo])

  // ------------------------------------------------------------- el render

  const grupoAbierto = abierto != null ? grupos[abierto] : null
  const vistaAbierta = abierto != null ? vistas[abierto] : null
  const visibles = vistaAbierta?.visibles ?? []
  const elegido = seleccionadoId ? visibles.find((m) => m._id === seleccionadoId) : undefined

  const cerrarPopup = () => setAbierto(null)

  const renderDetalle = (m) => (
    <DetalleMedidor
      medidor={m}
      toesDelMedidor={vistaAbierta?.toesPorId.get(m._id)}
      toesConfig={toesConfig}
      rolUsuario={rolUsuario}
      esMobil={esMobil}
      onCerrar={cerrarPopup}
      onEditar={onEditar}
      onEliminar={onEliminar}
      onFotoSubida={onFotoSubida}
      onResolverMarca={onResolverMarca}
    />
  )

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={contenedor} style={{ height: '100%', width: '100%' }} />

      {/* Selector de capa. En Leaflet esto lo daba LayersControl; MapLibre no
          trae equivalente, así que va como un botón propio en el mismo lugar
          (arriba a la derecha) para que no cambie dónde hay que buscarlo. */}
      <button
        type="button"
        title={capa === 'satelite' ? 'Ver calles' : 'Ver satélite'}
        onClick={() => onCambioCapa?.(capa === 'satelite' ? 'calles' : 'satelite')}
        style={{
          // Debajo del buscador, que en un teléfono angosto ocupa todo el
          // ancho de arriba y lo taparía.
          position: 'absolute', top: '3.2rem', right: '0.6rem', zIndex: 1001,
          background: '#fff', border: '2px solid rgba(0,0,0,0.2)', borderRadius: '4px',
          width: '36px', height: '36px', fontSize: '1.1rem', lineHeight: 1,
          cursor: 'pointer', padding: 0,
        }}>
        {capa === 'satelite' ? '🗺️' : '🛰️'}
      </button>

      {grupoAbierto && divPopup.current && createPortal(
        <ContenidoPopup
          grupo={visibles}
          elegido={elegido}
          onElegir={(m) => onElegir(m._id)}
          esMobil={esMobil}
          onCerrar={cerrarPopup}
          renderDetalle={renderDetalle}
        />,
        divPopup.current
      )}
    </div>
  )
}

// ------------------------------------------------------------------ ayudas

const datosActuales = (d) => aGeoJson(d.grupos, d.vistas, d.seleccionadoId, d.grupoSeleccionado)

/**
 * Qué imagen le toca a un grupo.
 *
 * El orden de prioridades es el mismo que aplica la capa de Leaflet: dorado si
 * está elegido, el color propio del punto (la clave con que TOES lo tomó, o el
 * tipo de marca permanente) y si no el estado de mapeo. Cuando hay varios
 * medidores, el contador va DENTRO de la imagen.
 */
function iconoDe(vista, marcado) {
  const visibles = vista.visibles
  const base = marcado
    ? 'seleccionado'
    : vista.color
      ? nombreDePinDeColor(vista.color)
      : (visibles[0].estado in PINES ? visibles[0].estado : 'pendiente')
  return visibles.length > 1 ? nombreConContador(base, visibles.length) : base
}

/**
 * Deja registradas las imágenes que los datos vayan a pedir.
 *
 * Dos familias: los pines de un color (la clave de TOES o el tipo de marca) y
 * los pines con contador. Las dos se generan una sola vez y quedan. El techo es
 * bajo: la tabla tiene 34 claves y los grupos rara vez pasan de una decena.
 *
 * Hay que hacerlo ANTES de mandar los datos: si el estilo pide una imagen que
 * no existe, MapLibre no dibuja ese pin y lo avisa por consola en cada frame.
 */
function registrarImagenes(mapa, vistas) {
  const cuentas = new Set()

  for (const v of vistas) {
    if (v.oculto) continue

    if (v.color) {
      const nombre = nombreDePinDeColor(v.color)
      if (!mapa.hasImage(nombre)) {
        try {
          const { data, pixelRatio } = pinDeColor(v.color, RATIO_DE_LOS_PNG)
          mapa.addImage(nombre, data, { pixelRatio })
        } catch { /* un color que no se puede dibujar cae al pin del estado */ }
      }
    }

    if (v.visibles.length > 1) cuentas.add(v.visibles.length)
  }

  // El contador siempre cae sobre un pin de estado o sobre el dorado del
  // seleccionado: el color propio solo existe cuando hay UN medidor visible.
  for (const cuenta of cuentas) {
    for (const base of Object.keys(PINES)) {
      const nombre = nombreConContador(base, cuenta)
      if (mapa.hasImage(nombre) || !imagenesBase.has(base)) continue
      try {
        const { data, pixelRatio } = pinConContador(imagenesBase.get(base), cuenta, RATIO_DE_LOS_PNG)
        mapa.addImage(nombre, data, { pixelRatio })
      } catch { /* sin contador se ve el pin pelado; no se rompe el mapa */ }
    }
  }
}

// Las imágenes ya decodificadas, para poder componerles el contador encima sin
// volver a bajarlas. Sobrevive a un cambio de capa, que borra las del mapa.
const imagenesBase = new Map()

async function cargarIconos(mapa) {
  // Los mismos PNG que usa Leaflet, así que la silueta es idéntica.
  await Promise.all(Object.entries(PINES).map(async ([nombre, url]) => {
    try {
      if (!imagenesBase.has(nombre)) {
        const img = await mapa.loadImage(url)
        imagenesBase.set(nombre, img.data)
      }
      if (!mapa.hasImage(nombre)) {
        mapa.addImage(nombre, imagenesBase.get(nombre), { pixelRatio: RATIO_DE_LOS_PNG })
      }
    } catch { /* un icono que no carga no puede tumbar el mapa */ }
  }))
}

function agregarCapaDePines(mapa, datos) {
  if (mapa.getSource(FUENTE)) return

  mapa.addSource(FUENTE, { type: 'geojson', data: datosActuales(datos) })

  mapa.addLayer({
    id: CAPA_PINES,
    type: 'symbol',
    source: FUENTE,
    layout: {
      'icon-image': ['get', 'icono'],
      // Abajo al medio, como iconAnchor [12, 41] en Leaflet.
      'icon-anchor': 'bottom',
      // Sin esto MapLibre esconde los pines que se pisan, y en un poste con
      // varios servicios eso haría desaparecer puntos del mapa.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // El elegido va encima de los demás cuando están pegados, igual que el
      // zIndexOffset que tenía en Leaflet.
      'symbol-sort-key': ['case', ['get', 'marcado'], 1, 0],
    },
    paint: { 'icon-opacity': ['get', 'opacidad'] },
  })

}

/**
 * Qué pasa al tocar un pin.
 *
 * Mismo criterio que en Leaflet: si en el punto hay un solo medidor se lo
 * selecciona (queda dorado); si hay varios se marca el GRUPO y el popup abre
 * con la lista para elegir cuál.
 */
function manejarToqueDePin(indice, datos, setAbierto) {
  const vista = datos.vistas[indice]
  if (!vista || vista.oculto) return
  const visibles = vista.visibles

  setAbierto(indice)
  if (visibles.length > 1) {
    datos.onElegirGrupo?.(visibles.map((m) => m._id).join('-'))
  } else if (visibles[0]) {
    datos.onElegir?.(visibles[0]._id)
  }
}

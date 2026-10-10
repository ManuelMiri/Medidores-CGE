// src/components/MapaGL.jsx
// El mismo mapa, pero con el motor sobre GPU.
//
// POR QUÉ existe esto. Medido en el teléfono (A36, z16, misma zona, misma UL,
// con la vista anclada para que las corridas sean comparables):
//
//   vista SIN pines      0 pines   p50 22 ms   p95 36-53 ms
//   vista CON pines   ~130 pines   p50 41 ms   p95 57 ms
//
// O sea que ~130 marcadores de DOM cuestan unos +18 ms por frame: ellos solos
// se comen más que el presupuesto entero de 16,7 ms. Con Leaflet eso no se
// puede arreglar — son <img> que el navegador reposiciona uno por uno — y es
// exactamente el techo que el README ya describía. Acá los pines son sprites
// en una capa `symbol`: los dibuja la GPU de una pasada.
//
// Es un SPIKE detrás de un flag, no un reemplazo: sirve para poder MEDIR si el
// cambio de motor vale la pena antes de reescribir popups, formularios y
// captura de fotos, que es donde está el trabajo de verdad.
//
// Lo que NO cambia es el aspecto, y es un requisito, no un gusto: la gota con
// el contador rojo es la identidad del mapa. Se usan los MISMOS PNG que
// iconosMapa.js, con el mismo anclaje abajo, y el contador se arma con un
// círculo y un texto en las mismas posiciones que les da index.css a los
// marcadores de Leaflet.

import { useEffect, useRef } from 'react'
// maplibre-gl 6 ya no trae export default en su build ESM: hay que pedir los
// nombres sueltos. Con el default el build muere en MISSING_EXPORT.
import { Map as MapaLibre, setWorkerUrl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
// El worker, con la URL que le da Vite al empaquetarlo.
//
// Sin esto el mapa se ve pero NO dibuja nada vectorial, y encima en silencio:
// la foto satelital y los caminos aparecen (son raster, no pasan por el
// worker) pero la fuente GeoJSON de los pines se queda en cero features, sin
// un solo error en la consola ni en el evento `error` del mapa. Costo media
// hora de depuracion.
//
// El motivo: maplibre-gl 6 carga su worker de un archivo aparte,
// `maplibre-gl-worker.mjs`, resolviendolo relativo a la URL de su propio
// modulo. Al bundlear, esa URL pasa a ser /assets/index-<hash>.js, asi que el
// worker se busca en /assets/maplibre-gl-worker.mjs — un archivo que no
// existe, porque Vite no tiene como saber que hace falta. Con ?url se emite
// como asset y se le dice a maplibre donde quedo. El worker no importa nada,
// asi que publicarlo suelto alcanza.
import urlDelWorker from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

setWorkerUrl(urlDelWorker)
import { URL_CALLES, URL_FOTO, URL_CAMINOS } from '../config/capasMapa'
import { medicionActiva, registrarMapaParaMedicion } from '../utils/medirFluidez'
import pinVerde2x from '../assets/pines/marker-icon-2x-green.png'
import pinRojo2x from '../assets/pines/marker-icon-2x-red.png'
import pinAzul2x from '../assets/pines/marker-icon-2x-blue.png'
import pinNaranja2x from '../assets/pines/marker-icon-2x-orange.png'
import pinMorado2x from '../assets/pines/marker-icon-2x-violet.png'
import pinDorado2x from '../assets/pines/marker-icon-2x-gold.png'

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

// El contador va donde lo pone index.css para los pines de Leaflet: arriba a la
// derecha, pisando un poco la gota. Con el icono anclado abajo y midiendo
// 25x41, eso cae en estos píxeles respecto del ancla.
const CORRIMIENTO_CONTADOR = [13.5, -40]
const RADIO_CONTADOR = 13

function estiloDeCapas(capa) {
  const satelite = capa === 'satelite'
  return {
    version: 8,
    // Sin glyphs externos no hay texto, y el contador ES texto. Se piden a
    // demo.tiles del proyecto MapLibre solo mientras esto sea un spike: para
    // producción hay que servirlos propios, porque depender de un host ajeno
    // para el mapa es justo lo que ya pasó con CARTO.
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: satelite
      ? {
          foto: { type: 'raster', tiles: [URL_FOTO], tileSize: 256, maxzoom: ZOOM_MAXIMO },
          caminos: { type: 'raster', tiles: [URL_CAMINOS], tileSize: 256, maxzoom: ZOOM_MAXIMO },
        }
      : {
          calles: { type: 'raster', tiles: [URL_CALLES], tileSize: 256, maxzoom: ZOOM_MAXIMO },
        },
    layers: satelite
      ? [
          { id: 'foto', type: 'raster', source: 'foto' },
          { id: 'caminos', type: 'raster', source: 'caminos' },
        ]
      : [{ id: 'calles', type: 'raster', source: 'calles' }],
  }
}

/** Los grupos, como GeoJSON para la fuente del mapa. */
function aGeoJson(grupos, vistas) {
  const features = []
  for (let i = 0; i < grupos.length; i++) {
    const vista = vistas[i]
    if (vista.oculto) continue
    const cuantos = vista.visibles.length
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [grupos[i].position[1], grupos[i].position[0]] },
      properties: {
        // El estado del primer visible decide el color, igual que en
        // vistaDeGrupo. Los pines de color de clave (divIcon con SVG en
        // Leaflet) todavía no están acá: para eso hace falta un icono SDF que
        // se pueda teñir, y este spike mide el caso común.
        icono: vista.visibles[0].estado in PINES ? vista.visibles[0].estado : 'pendiente',
        opacidad: vista.opacidad ?? 1,
        cuenta: cuantos,
        etiqueta: cuantos > 1 ? String(cuantos) : '',
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

export default function MapaGL({ grupos, vistas, capa, onElegirGrupo }) {
  const contenedor = useRef(null)
  const mapaRef = useRef(null)
  const listoRef = useRef(false)
  // Los datos más frescos, para el adaptador de medición y para el primer
  // dibujado: el mapa tarda en estar listo y mientras tanto pueden cambiar.
  const datosRef = useRef({ grupos, vistas })
  datosRef.current = { grupos, vistas }

  // Montaje del mapa. Una sola vez: cambiar de capa o de datos NO lo recrea.
  useEffect(() => {
    if (mapaRef.current) return

    const mapa = new MapaLibre({
      container: contenedor.current,
      style: estiloDeCapas(capa),
      center: CENTRO_MAULE,
      zoom: 13,
      maxZoom: ZOOM_MAXIMO,
      // El mapa se queda al norte, como el de Leaflet: rotarlo rompería la
      // referencia que el lector ya tiene y el clic para agregar un punto.
      pitchWithRotate: false,
      dragRotate: false,
      touchZoomRotate: true,
      attributionControl: { compact: true },
    })
    mapaRef.current = mapa
    mapa.touchZoomRotate.disableRotation()

    // Solo mientras esto sea un spike: deja el mapa a mano para poder
    // interrogarlo desde la consola del WebView sin recompilar.
    if (medicionActiva()) window.__mapaGL = mapa

    mapa.on('load', async () => {
      // Los PNG de los pines, a la GPU. Son los mismos archivos que usa
      // Leaflet, así que la silueta es idéntica.
      await Promise.all(Object.entries(PINES).map(async ([nombre, url]) => {
        try {
          const img = await mapa.loadImage(url)
          if (!mapa.hasImage(nombre)) {
            mapa.addImage(nombre, img.data, { pixelRatio: RATIO_DE_LOS_PNG })
          }
        } catch { /* un icono que no carga no puede tumbar el mapa */ }
      }))

      mapa.addSource('medidores', { type: 'geojson', data: aGeoJson(datosRef.current.grupos, datosRef.current.vistas) })

      mapa.addLayer({
        id: 'pines',
        type: 'symbol',
        source: 'medidores',
        layout: {
          'icon-image': ['get', 'icono'],
          // Abajo al medio, como iconAnchor [12, 41] en Leaflet.
          'icon-anchor': 'bottom',
          // Sin esto MapLibre esconde los pines que se pisan, y en un poste con
          // varios servicios eso haría desaparecer puntos del mapa.
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': ['get', 'opacidad'] },
      })

      // El contador: círculo rojo con borde blanco y el número encima, en la
      // misma posición que .pin-grupo-contador de index.css.
      mapa.addLayer({
        id: 'contador-fondo',
        type: 'circle',
        source: 'medidores',
        filter: ['>', ['get', 'cuenta'], 1],
        paint: {
          'circle-radius': RADIO_CONTADOR,
          'circle-color': '#c53030',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-translate': CORRIMIENTO_CONTADOR,
          'circle-translate-anchor': 'viewport',
        },
      })

      mapa.addLayer({
        id: 'contador-texto',
        type: 'symbol',
        source: 'medidores',
        filter: ['>', ['get', 'cuenta'], 1],
        layout: {
          'text-field': ['get', 'etiqueta'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 13,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-offset': [0, 0],
        },
        paint: {
          'text-color': '#ffffff',
          'text-translate': CORRIMIENTO_CONTADOR,
          'text-translate-anchor': 'viewport',
        },
      })

      mapa.on('click', 'pines', (e) => {
        const f = e.features?.[0]
        if (f) onElegirGrupo?.(f)
      })
      mapa.on('mouseenter', 'pines', () => { mapa.getCanvas().style.cursor = 'pointer' })
      mapa.on('mouseleave', 'pines', () => { mapa.getCanvas().style.cursor = '' })

      listoRef.current = true
      // Los datos se vuelven a aplicar ACA, y no solo en el efecto de abajo,
      // por una carrera que deja el mapa vacio para siempre: este handler es
      // asincrono porque carga los PNG, y si los medidores llegan mientras
      // tanto, el efecto corre con listoRef todavia en false y se salta. Como
      // `grupos` no vuelve a cambiar, la fuente se queda en cero features.
      // Paso de verdad, y se ve como un mapa sin un solo pin y sin un solo
      // error en la consola.
      mapa.getSource('medidores')?.setData(
        aGeoJson(datosRef.current.grupos, datosRef.current.vistas)
      )
    })

    return () => {
      listoRef.current = false
      mapa.remove()
      mapaRef.current = null
    }
    // Solo al montar: la capa inicial se lee una vez y los cambios van por el
    // efecto de abajo. Meter `capa` acá recrearía el mapa entero al cambiarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Datos nuevos: se actualiza la fuente, no el mapa. Es lo que hace que
  // cambiar de UL o que TOES tome un punto no cueste un remontaje.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listoRef.current) return
    mapa.getSource('medidores')?.setData(aGeoJson(grupos, vistas))
  }, [grupos, vistas])

  // Cambio de capa base: se cambia el estilo y se vuelven a poner los pines,
  // porque setStyle se lleva por delante las fuentes y capas propias.
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !listoRef.current) return
    listoRef.current = false
    mapa.setStyle(estiloDeCapas(capa))
    mapa.once('styledata', () => {
      if (!mapa.getSource('medidores')) return
      listoRef.current = true
    })
  }, [capa])

  // Medición: el mismo adaptador que registra el mapa de Leaflet, para que la
  // misma herramienta pueda medir los dos motores y compararlos.
  useEffect(() => {
    if (!medicionActiva()) return
    const mapa = mapaRef.current
    if (!mapa) return

    const vista = () => {
      const c = mapa.getCenter()
      return { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), zoom: +mapa.getZoom().toFixed(2) }
    }

    registrarMapaParaMedicion({
      motor: 'maplibre',
      irA: (lat, lng, zoom) => {
        mapa.jumpTo({ center: [lng, lat], zoom })
        return vista()
      },
      irAPines: (zoom) => {
        const gs = datosRef.current.grupos
        if (!gs.length) return null
        let lat = 0
        let lng = 0
        for (const g of gs) {
          lat += g.position[0]
          lng += g.position[1]
        }
        mapa.jumpTo({ center: [lng / gs.length, lat / gs.length], zoom })
        return vista()
      },
      vista,
    })
    return () => registrarMapaParaMedicion(null)
  }, [])

  return <div ref={contenedor} style={{ height: '100%', width: '100%' }} />
}

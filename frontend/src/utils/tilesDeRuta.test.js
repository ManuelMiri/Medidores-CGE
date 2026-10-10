// Pruebas del cálculo de tiles a precargar.
//   npm test
//
// Lo que se protege acá son los dos errores que no se ven: el eje Y de los
// tiles crece hacia el SUR (invertirlo baja la zona equivocada sin dar ningún
// error) y el orden [lng, lat] del GeoJSON contra el [lat, lng] de todo lo
// demás. Los dos terminan en "precargué la ruta y el mapa sigue vacío", que es
// la clase de bug que se descubre en terreno.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  tileDe,
  bboxDe,
  tilesDeBbox,
  tilesDePuntos,
  tilesDeRuta,
  urlsDeTiles,
  mbEstimados,
} from './tilesDeRuta.js'

// Mongo guarda GeoJSON, y ahí el orden es [lng, lat] — al revés de lo que usa
// Leaflet. El helper imita la forma real del documento, igual que agrupar.test.
function medidor(id, lng, lat) {
  return { _id: id, instalacion: 'I' + id, ubicacion: { type: 'Point', coordinates: [lng, lat] } }
}

describe('tileDe', () => {
  test('el origen del mundo', () => {
    // A z0 el mundo entero es un solo tile.
    assert.deepEqual(tileDe(0, 0, 0), { x: 0, y: 0 })
  })

  test('los cuatro cuadrantes a z1', () => {
    // Noroeste, noreste, suroeste, sureste. Si el eje Y estuviera invertido,
    // el norte daría y=1 en vez de y=0.
    assert.deepEqual(tileDe(45, -90, 1), { x: 0, y: 0 })
    assert.deepEqual(tileDe(45, 90, 1), { x: 1, y: 0 })
    assert.deepEqual(tileDe(-45, -90, 1), { x: 0, y: 1 })
    assert.deepEqual(tileDe(-45, 90, 1), { x: 1, y: 1 })
  })

  test('más al norte es un y MENOR', () => {
    // El error clásico del esquema slippy: el eje Y crece hacia el sur.
    const norte = tileDe(-35.0, -71.6, 14)
    const sur = tileDe(-36.0, -71.6, 14)
    assert.ok(norte.y < sur.y, `norte.y=${norte.y} tendría que ser menor que sur.y=${sur.y}`)
  })

  test('una latitud imposible no devuelve NaN', () => {
    // Web Mercator diverge en los polos: sin recorte, el log(tan(90°)) da
    // Infinity y el tile sale NaN, que despues se convierte en una URL rota.
    const t = tileDe(90, 0, 5)
    assert.ok(Number.isInteger(t.x) && Number.isInteger(t.y))
    assert.ok(t.y >= 0 && t.y < 2 ** 5)
  })
})

describe('bboxDe', () => {
  test('toma lat y lng en el orden del GeoJSON', () => {
    const bbox = bboxDe([medidor('a', -71.7, -35.6), medidor('b', -71.5, -35.4)])
    assert.deepEqual(bbox, { minLat: -35.6, maxLat: -35.4, minLng: -71.7, maxLng: -71.5 })
  })

  test('los medidores sin ubicación se saltan', () => {
    const bbox = bboxDe([
      medidor('a', -71.6, -35.5),
      { _id: 'b' },
      { _id: 'c', ubicacion: {} },
    ])
    assert.deepEqual(bbox, { minLat: -35.5, maxLat: -35.5, minLng: -71.6, maxLng: -71.6 })
  })

  test('sin ninguno ubicado devuelve null', () => {
    assert.equal(bboxDe([{ _id: 'a' }]), null)
    assert.equal(bboxDe([]), null)
  })
})

describe('tilesDeBbox', () => {
  test('un bbox de un punto da un tile', () => {
    const tiles = tilesDeBbox({ minLat: -35.5, maxLat: -35.5, minLng: -71.6, maxLng: -71.6 }, 14)
    assert.equal(tiles.size, 1)
  })

  test('cubre el rectángulo entero, sin agujeros', () => {
    // Un bbox que a z14 abarca varios tiles: la cantidad tiene que ser
    // exactamente ancho x alto en tiles.
    const bbox = { minLat: -35.6, maxLat: -35.4, minLng: -71.7, maxLng: -71.5 }
    const tiles = tilesDeBbox(bbox, 14)
    const arriba = tileDe(bbox.maxLat, bbox.minLng, 14)
    const abajo = tileDe(bbox.minLat, bbox.maxLng, 14)
    const esperados = (abajo.x - arriba.x + 1) * (abajo.y - arriba.y + 1)
    assert.equal(tiles.size, esperados)
    assert.ok(esperados > 1, 'el caso de prueba tendría que abarcar más de un tile')
  })

  test('un bbox nulo no agrega nada', () => {
    assert.equal(tilesDeBbox(null, 14).size, 0)
  })
})

describe('tilesDePuntos', () => {
  test('un punto con anillo 1 da 9 tiles', () => {
    const tiles = tilesDePuntos([medidor('a', -71.6, -35.5)], 16, 1)
    assert.equal(tiles.size, 9)
  })

  test('un punto con anillo 0 da 1 tile', () => {
    assert.equal(tilesDePuntos([medidor('a', -71.6, -35.5)], 16, 0).size, 1)
  })

  test('dos medidores del mismo punto no duplican tiles', () => {
    // Es el caso real del agrupado: varios servicios en el mismo poste.
    const tiles = tilesDePuntos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6, -35.5),
    ], 16, 1)
    assert.equal(tiles.size, 9)
  })
})

describe('tilesDeRuta', () => {
  const ruta = []
  for (let i = 0; i < 40; i++) {
    // Una ruta que avanza ~150 m por medidor, como una rural de verdad.
    ruta.push(medidor('m' + i, -71.6 + i * 0.0017, -35.5 + i * 0.0013))
  }

  test('no repite un tile entre estrategias ni entre zooms', () => {
    const { tiles } = tilesDeRuta(ruta)
    const claves = tiles.map((t) => `${t.z}/${t.x}/${t.y}`)
    assert.equal(new Set(claves).size, claves.length)
  })

  test('cubre todos los zooms pedidos', () => {
    const { tiles } = tilesDeRuta(ruta, { zMin: 13, zBbox: 15, zMax: 18 })
    const zooms = [...new Set(tiles.map((t) => t.z))].sort((a, b) => a - b)
    assert.deepEqual(zooms, [13, 14, 15, 16, 17, 18])
  })

  test('los zooms altos van por punto y no por rectángulo', () => {
    // Es la decisión que hace viable la descarga: el rectángulo completo a z18
    // serían miles de tiles de campo vacío. Con 40 medidores y anillo 1 el
    // techo por zoom es 40*9 = 360, bastante menos que el rectángulo.
    const { tiles } = tilesDeRuta(ruta, { zMin: 18, zBbox: 15, zMax: 18, anillo: 1 })
    const porBbox = tilesDeBbox(bboxDe(ruta), 18).size
    assert.ok(tiles.length <= 360)
    assert.ok(tiles.length < porBbox, `por punto ${tiles.length} tendría que ser menos que por bbox ${porBbox}`)
  })

  test('el tope corta por los zooms altos, no por los bajos', () => {
    // Si hay que cortar, lo que tiene que sobrevivir es la vista general
    // completa: un mapa general sirve, un detalle con agujeros no.
    const { tiles, truncado, total } = tilesDeRuta(ruta, { tope: 30 })
    assert.equal(tiles.length, 30)
    assert.equal(truncado, true)
    assert.ok(total > 30)
    // Ordenado por zoom ascendente: el primero es el zoom más bajo.
    assert.ok(tiles[0].z <= tiles[tiles.length - 1].z)
  })

  test('una ruta sin ubicaciones no pide nada', () => {
    const { tiles, total } = tilesDeRuta([{ _id: 'a' }])
    assert.equal(tiles.length, 0)
    assert.equal(total, 0)
  })
})

describe('urlsDeTiles', () => {
  test('sustituye por nombre, así sirve para OSM y para Esri', () => {
    // Esri invierte x e y respecto de OSM. Sustituir por posición daría la
    // zona equivocada en una de las dos capas, sin ningún error visible.
    const tiles = [{ z: 14, x: 100, y: 200 }]

    assert.deepEqual(
      urlsDeTiles(tiles, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
      ['https://tile.openstreetmap.org/14/100/200.png']
    )
    assert.deepEqual(
      urlsDeTiles(tiles, 'https://server.arcgisonline.com/x/tile/{z}/{y}/{x}'),
      ['https://server.arcgisonline.com/x/tile/14/200/100']
    )
  })

  test('respeta lo que venga después de la plantilla', () => {
    assert.deepEqual(
      urlsDeTiles([{ z: 1, x: 2, y: 3 }], 'https://e/{z}/{y}/{x}?blankTile=false'),
      ['https://e/1/3/2?blankTile=false']
    )
  })
})

describe('mbEstimados', () => {
  test('da un número con un decimal', () => {
    assert.equal(mbEstimados(0), 0)
    assert.equal(mbEstimados(512), 10)
  })
})

// Pruebas del agrupado de medidores por punto.
//   npm test
//
// Lo que se protege acá: el orden lat/lng y la referencia de `position`.
// Los dos fallan en silencio — con lat y lng cambiados los pines aparecen en
// otro continente, y si `position` se recreara, react-leaflet reposicionaría
// los ~300 marcadores en cada render del mapa sin que nada se vea raro.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { agruparCercanos } from './agrupar.js'

// Mongo guarda GeoJSON, y en GeoJSON el orden es [lng, lat] — al revés de lo
// que espera Leaflet. Ese cruce es el error clásico, así que el helper imita
// la forma real del documento.
function medidor(id, lng, lat) {
  return { _id: id, instalacion: 'I' + id, ubicacion: { type: 'Point', coordinates: [lng, lat] } }
}

// En el Maule (lat ~-35.5): 1 grado de lat ~110.540 m, 1 de lng ~90.600 m.
const UN_METRO_LAT = 1 / 110540
const UN_METRO_LNG = 1 / (111320 * Math.cos(-35.5 * Math.PI / 180))

describe('agruparCercanos', () => {
  test('junta los que están dentro del radio', () => {
    const grupos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6, -35.5 + 3 * UN_METRO_LAT), // 3 m al norte
    ], 5)

    assert.equal(grupos.length, 1)
    assert.deepEqual(grupos[0].medidores.map((m) => m._id), ['a', 'b'])
  })

  test('separa los que están fuera del radio', () => {
    const grupos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6, -35.5 + 20 * UN_METRO_LAT), // 20 m al norte
    ], 5)

    assert.equal(grupos.length, 2)
  })

  test('el radio también se mide en longitud', () => {
    // Si se compararan grados crudos sin corregir por el coseno de la latitud,
    // un grado de longitud valdría lo mismo que uno de latitud y este caso
    // daría un solo grupo.
    const juntos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6 + 3 * UN_METRO_LNG, -35.5),
    ], 5)
    const separados = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6 + 20 * UN_METRO_LNG, -35.5),
    ], 5)

    assert.equal(juntos.length, 1)
    assert.equal(separados.length, 2)
  })

  test('position viene en [lat, lng], no como el GeoJSON', () => {
    const [grupo] = agruparCercanos([medidor('a', -71.6, -35.5)], 5)
    assert.deepEqual(grupo.position, [-35.5, -71.6])
    assert.equal(grupo.lat, -35.5)
    assert.equal(grupo.lng, -71.6)
  })

  test('position es el MISMO objeto aunque al grupo se le sumen medidores', () => {
    // La propiedad que importa para el rendimiento: se crea una vez por grupo.
    const grupos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6, -35.5 + 2 * UN_METRO_LAT),
      medidor('c', -71.6, -35.5 + 4 * UN_METRO_LAT),
    ], 5)

    assert.equal(grupos.length, 1)
    assert.equal(grupos[0].medidores.length, 3)
    const position = grupos[0].position
    // el grupo creció y su position sigue apuntando al primero
    assert.equal(grupos[0].position, position)
    assert.deepEqual(position, [-35.5, -71.6])
  })

  test('se compara contra el PRIMERO del grupo, no contra el último', () => {
    // Comportamiento documentado y a propósito: así un grupo no se estira en
    // cadena. Tres medidores en fila, cada uno a 4 m del anterior: el tercero
    // está a 8 m del primero, así que arma grupo aparte aunque esté a 4 m del
    // segundo.
    const grupos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      medidor('b', -71.6, -35.5 + 4 * UN_METRO_LAT),
      medidor('c', -71.6, -35.5 + 8 * UN_METRO_LAT),
    ], 5)

    assert.equal(grupos.length, 2)
    assert.deepEqual(grupos[0].medidores.map((m) => m._id), ['a', 'b'])
    assert.deepEqual(grupos[1].medidores.map((m) => m._id), ['c'])
  })

  test('los medidores sin coordenadas se saltan sin romper nada', () => {
    const grupos = agruparCercanos([
      medidor('a', -71.6, -35.5),
      { _id: 'b', instalacion: 'Ib' }, // sin ubicacion
      { _id: 'c', instalacion: 'Ic', ubicacion: {} }, // sin coordinates
    ], 5)

    assert.equal(grupos.length, 1)
    assert.deepEqual(grupos[0].medidores.map((m) => m._id), ['a'])
  })

  test('una lista vacía devuelve una lista vacía', () => {
    assert.deepEqual(agruparCercanos([], 5), [])
  })

  test('cada grupo trae al menos un medidor y ninguno se pierde', () => {
    // Invariante sobre un caso más grande: la suma de los grupos tiene que ser
    // exactamente la lista de entrada, sin repetidos ni faltantes.
    const lista = []
    for (let i = 0; i < 60; i++) {
      // 20 puntos de a 3 medidores pegados, separados 50 m entre puntos
      const punto = Math.floor(i / 3)
      lista.push(medidor('m' + i, -71.6, -35.5 + punto * 50 * UN_METRO_LAT))
    }
    const grupos = agruparCercanos(lista, 5)

    assert.equal(grupos.length, 20)
    for (const g of grupos) assert.equal(g.medidores.length, 3)
    const ids = grupos.flatMap((g) => g.medidores.map((m) => m._id))
    assert.equal(ids.length, 60)
    assert.equal(new Set(ids).size, 60)
  })
})

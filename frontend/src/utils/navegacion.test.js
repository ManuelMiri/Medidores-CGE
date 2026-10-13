// Tests del enlace "Ir" a Google Maps.
import test from 'node:test'
import assert from 'node:assert/strict'
import { urlNavegacion } from './navegacion.js'

test('el destino va como lat,lng aunque GeoJSON lo guarde al revés', () => {
  const url = new URL(urlNavegacion({ ubicacion: { coordinates: [-71.6369835, -35.5869795] } }))
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/')
  assert.equal(url.searchParams.get('api'), '1')
  assert.equal(url.searchParams.get('destination'), '-35.5869795,-71.6369835')
  assert.equal(url.searchParams.get('travelmode'), 'driving')
})

test('sin ubicación no hay enlace', () => {
  assert.equal(urlNavegacion({}), null)
  assert.equal(urlNavegacion(null), null)
  assert.equal(urlNavegacion({ ubicacion: { coordinates: [] } }), null)
  assert.equal(urlNavegacion({ ubicacion: { coordinates: ['x', -35] } }), null)
})

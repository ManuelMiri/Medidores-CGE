// tests/moverUbicacion.test.js
// Mover un pin reemplaza a "borrarlo y crearlo de nuevo", que era la única
// salida cuando una ruta importada traía un servicio mal ubicado y que se
// llevaba consigo el historial y las fotos. Se protege quién puede moverlo y
// que la posición anterior no se pierda.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => { await connect() })
afterEach(async () => { await clearDatabase() })
afterAll(async () => { await closeDatabase() })

const UL = 'E3509011'
const INST = '103613434'

async function crearMedidor() {
  return Medidor.create({
    instalacion: INST,
    unidadDeLectura: UL,
    ubicacion: { type: 'Point', coordinates: [-71.65, -35.5] },
  })
}

const mover = (token, cuerpo, inst = INST) =>
  request(app)
    .patch(`/api/medidores/${inst}/ubicacion`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo)

describe('PATCH /api/medidores/:instalacion/ubicacion', () => {
  test('un admin mueve el punto y la posición anterior queda en el historial', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await mover(token, { lat: -35.6, lng: -71.7 })

    expect(res.status).toBe(200)
    expect(res.body.ubicacion.coordinates).toEqual([-71.7, -35.6])
    const ultimo = res.body.historial.at(-1).accion
    expect(ultimo).toContain('-35.500000, -71.650000')
    expect(ultimo).toContain('-35.600000, -71.700000')
  })

  test('un supervisor también puede moverlo', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('supervisor')
    const res = await mover(token, { lat: -35.6, lng: -71.7 })
    expect(res.status).toBe(200)
  })

  test('un lector no puede moverlo, ni siquiera en su propia UL', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })

    const res = await mover(token, { lat: -35.6, lng: -71.7 })

    expect(res.status).toBe(403)
    const enBase = await Medidor.findOne({ instalacion: INST })
    expect(enBase.ubicacion.coordinates).toEqual([-71.65, -35.5])
  })

  test('un lector tampoco puede moverlo por el PATCH general', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })

    await request(app)
      .patch(`/api/medidores/${INST}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ubicacion: { type: 'Point', coordinates: [-70, -30] } })

    const enBase = await Medidor.findOne({ instalacion: INST })
    expect(enBase.ubicacion.coordinates).toEqual([-71.65, -35.5])
  })

  test.each([
    [{}],
    [{ lat: -35.6 }],
    [{ lat: 'abc', lng: -71.7 }],
    [{ lat: '', lng: -71.7 }],
    [{ lat: null, lng: -71.7 }],
    [{ lat: -95, lng: -71.7 }],
    [{ lat: -35.6, lng: 200 }],
  ])('rechaza coordenadas inválidas: %j', async (cuerpo) => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await mover(token, cuerpo)

    expect(res.status).toBe(400)
    const enBase = await Medidor.findOne({ instalacion: INST })
    expect(enBase.ubicacion.coordinates).toEqual([-71.65, -35.5])
  })

  test('404 si la instalación no existe', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await mover(token, { lat: -35.6, lng: -71.7 }, '999')
    expect(res.status).toBe(404)
  })
})

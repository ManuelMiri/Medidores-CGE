// tests/marcasPendientes.test.js
// GET /api/medidores/marcas-pendientes: lo que espera que una persona confirme,
// de todas las ULs, para el modo revisión del mapa.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => {
  await connect()
})

afterEach(async () => {
  await clearDatabase()
})

afterAll(async () => {
  await closeDatabase()
})

const marca = (situacion, tipo = 'sitioEriazo') => ({ tipo, situacion, claveToes: '26', cicloOrigen: '2026-10-14' })

async function sembrar() {
  await Medidor.create([
    { instalacion: '300', unidadDeLectura: 'E2', marcaPermanente: marca('propuesta') },
    { instalacion: '200', unidadDeLectura: 'E1', marcaPermanente: marca('propuesta', 'noEncontrado') },
    { instalacion: '100', unidadDeLectura: 'E1', marcaPermanente: marca('propuesta') },
    { instalacion: '400', unidadDeLectura: 'E1', marcaPermanente: marca('confirmada') },
    { instalacion: '500', unidadDeLectura: 'E2', marcaPermanente: marca('rechazada') },
    { instalacion: '600', unidadDeLectura: 'E3' },
  ])
}

const pedir = (token) =>
  request(app).get('/api/medidores/marcas-pendientes').set('Authorization', `Bearer ${token}`)

describe('GET /api/medidores/marcas-pendientes', () => {
  test('trae solo las propuestas, de todas las ULs, ordenadas por UL e instalación', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await pedir(token)
    expect(res.status).toBe(200)
    expect(res.body.medidores.map((m) => `${m.unidadDeLectura}/${m.instalacion}`))
      .toEqual(['E1/100', 'E1/200', 'E2/300'])
    expect(res.body.medidores[1].marcaPermanente).toMatchObject({ tipo: 'noEncontrado', situacion: 'propuesta' })
  })

  test('un supervisor también: es quien puede confirmar', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('supervisor')
    const res = await pedir(token)
    expect(res.status).toBe(200)
    expect(res.body.medidores).toHaveLength(3)
  })

  test('un lector no', async () => {
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['E1'] })
    expect((await pedir(token)).status).toBe(403)
    expect((await request(app).get('/api/medidores/marcas-pendientes')).status).toBe(401)
  })

  test('no se confunde con GET /:instalacion, que sigue andando', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await request(app).get('/api/medidores/600').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.instalacion).toBe('600')
  })

  test('sin nada pendiente, lista vacía', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    expect((await pedir(token)).body.medidores).toEqual([])
  })
})

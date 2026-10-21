// tests/subidasUl.test.js
// GET /api/rutas/subidas: quién subió cada UL. Se importa por la ruta real
// (/api/importacion/confirmar) y no armando el historial a mano: así, si
// cambia el texto que deja la importación, este test lo nota.
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

async function importar(token, ul, instalaciones) {
  const res = await request(app)
    .post('/api/importacion/confirmar')
    .set('Authorization', `Bearer ${token}`)
    .send({ medidores: instalaciones.map((instalacion) => ({ instalacion, unidadDeLectura: ul })) })
  expect(res.status).toBe(201)
}

const pedir = (token, query = '') =>
  request(app).get('/api/rutas/subidas' + query).set('Authorization', `Bearer ${token}`)

describe('GET /api/rutas/subidas', () => {
  test('dice quién importó la UL', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin', { nombre: 'Luciano Trejos' })
    await importar(token, 'E3515013', ['111', '222'])

    const res = await pedir(token, '?ul=E3515013')
    expect(res.status).toBe(200)
    expect(res.body.subidas).toHaveLength(1)
    expect(res.body.subidas[0]).toMatchObject({ ul: 'E3515013', nombre: 'Luciano Trejos', medidores: 2, otros: 0 })
    expect(res.body.subidas[0].fecha).toBeTruthy()
  })

  test('es solo para admin', async () => {
    const { token: supervisor } = await crearUsuarioYObtenerToken('supervisor')
    const { token: lector } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['E3515013'] })
    expect((await pedir(supervisor)).status).toBe(403)
    expect((await pedir(lector)).status).toBe(403)
    expect((await request(app).get('/api/rutas/subidas')).status).toBe(401)
  })

  test('si la subieron en partes, cuenta la primera y avisa cuántos más', async () => {
    const { token: primero } = await crearUsuarioYObtenerToken('admin', { nombre: 'Primera Persona' })
    const { token: segundo } = await crearUsuarioYObtenerToken('admin', { nombre: 'Segunda Persona' })
    await importar(primero, 'E1', ['111', '222'])
    await importar(segundo, 'E1', ['333'])

    const [s] = (await pedir(primero, '?ul=E1')).body.subidas
    expect(s).toMatchObject({ nombre: 'Primera Persona', medidores: 2, otros: 1 })
  })

  test('los medidores creados de otra forma no cuentan como subida', async () => {
    const { token, usuario } = await crearUsuarioYObtenerToken('admin', { nombre: 'Luciano Trejos' })
    await Medidor.create({
      instalacion: '999', unidadDeLectura: 'E2',
      historial: [{ usuario: usuario._id, nombre: 'Luciano Trejos', accion: 'Creado desde TOES' }],
    })
    expect((await pedir(token, '?ul=E2')).body.subidas).toEqual([])
  })

  test('con ?ul trae solo esas; sin él, todas', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin', { nombre: 'Luciano Trejos' })
    await importar(token, 'E1', ['111'])
    await importar(token, 'E2', ['222'])
    await importar(token, 'E3', ['333'])

    const algunas = (await pedir(token, '?ul=E1,E3')).body.subidas.map((s) => s.ul).sort()
    expect(algunas).toEqual(['E1', 'E3'])
    const todas = (await pedir(token)).body.subidas.map((s) => s.ul).sort()
    expect(todas).toEqual(['E1', 'E2', 'E3'])
  })
})

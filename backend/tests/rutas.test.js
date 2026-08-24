// tests/rutas.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const XLSX = require('xlsx')
const app = require('../app')
const Medidor = require('../models/Medidor')
const Usuario = require('../models/Usuario')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

// supertest/superagent no siempre buffer-ea automáticamente contenido
// binario según el Content-Type. Este parser fuerza a que el response
// body llegue como Buffer, sin importar el tipo de contenido — así el
// test del .xlsx exportado es confiable en cualquier entorno.
function parserBinario(res, callback) {
  const trozos = []
  res.on('data', (trozo) => trozos.push(trozo))
  res.on('end', () => callback(null, Buffer.concat(trozos)))
}

beforeAll(async () => {
  await connect()
})

afterEach(async () => {
  await clearDatabase()
})

afterAll(async () => {
  await closeDatabase()
})

describe('DELETE /api/rutas/:ul', () => {
  test('un admin elimina todos los medidores de esa UL y ninguno de otra', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    await Medidor.create([
      { instalacion: '111', unidadDeLectura: 'E1111111' },
      { instalacion: '222', unidadDeLectura: 'E1111111' },
      { instalacion: '333', unidadDeLectura: 'E2222222' },
    ])

    const res = await request(app)
      .delete('/api/rutas/E1111111')
      .set('Authorization', `Bearer ${tokenAdmin}`)

    expect(res.status).toBe(200)
    expect(res.body.totalEliminados).toBe(2)

    const restantes = await Medidor.find()
    expect(restantes).toHaveLength(1)
    expect(restantes[0].unidadDeLectura).toBe('E2222222')
  })

  test('también quita la UL de la lista de cualquier lector que la tuviera asignada', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector', {
      unidadesLectura: ['E1111111', 'E2222222'],
    })
    await Medidor.create({ instalacion: '111', unidadDeLectura: 'E1111111' })

    await request(app)
      .delete('/api/rutas/E1111111')
      .set('Authorization', `Bearer ${tokenAdmin}`)

    const lectorActualizado = await Usuario.findById(lector._id)
    expect(lectorActualizado.unidadesLectura).toEqual(['E2222222'])
  })

  test('un no-admin no puede eliminar una ruta', async () => {
    const { token: tokenSupervisor } = await crearUsuarioYObtenerToken('supervisor')
    await Medidor.create({ instalacion: '111', unidadDeLectura: 'E1111111' })

    const res = await request(app)
      .delete('/api/rutas/E1111111')
      .set('Authorization', `Bearer ${tokenSupervisor}`)

    expect(res.status).toBe(403)
    expect(await Medidor.countDocuments()).toBe(1)
  })

  test('devuelve 404 si la UL no tiene medidores', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')

    const res = await request(app)
      .delete('/api/rutas/E9999999')
      .set('Authorization', `Bearer ${tokenAdmin}`)

    expect(res.status).toBe(404)
  })
})

describe('GET /api/rutas/:ul/exportar', () => {
  test('un admin descarga la ruta como .xlsx con las columnas de SAP', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    await Medidor.create({
      instalacion: '111', unidadDeLectura: 'E1111111',
      zona: 'MAULE', direccion: 'CALLE UNO 123',
      ubicacion: { coordinates: [-71.10, -35.58] }, // [lng, lat]
    })

    const res = await request(app)
      .get('/api/rutas/E1111111/exportar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .buffer(true)
      .parse(parserBinario)

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('spreadsheetml')

    const libro = XLSX.read(res.body, { type: 'buffer' })
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]])

    expect(filas).toHaveLength(1)
    expect(filas[0].INSTALACION).toBe('111')
    expect(filas[0].DIRECCION).toBe('CALLE UNO 123')
    // Vuelve a "lat, lng" (al revés de como lo guardamos internamente)
    expect(filas[0].COORDENADAS).toBe('-35.58, -71.1')
  })

  test('un lector no puede exportar (solo admin y supervisor)', async () => {
    const { token: tokenLector } = await crearUsuarioYObtenerToken('lector')
    await Medidor.create({ instalacion: '111', unidadDeLectura: 'E1111111' })

    const res = await request(app)
      .get('/api/rutas/E1111111/exportar')
      .set('Authorization', `Bearer ${tokenLector}`)

    expect(res.status).toBe(403)
  })

  test('devuelve 404 si la UL no tiene medidores', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')

    const res = await request(app)
      .get('/api/rutas/E9999999/exportar')
      .set('Authorization', `Bearer ${tokenAdmin}`)

    expect(res.status).toBe(404)
  })
})
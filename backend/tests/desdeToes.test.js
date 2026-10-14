// tests/desdeToes.test.js
// Un servicio tomado en TOES que no estaba en el mapa: la app crea su pin con
// el GPS del lector al guardar. Lo que se protege: que nunca pise ni mueva un
// medidor que ya existe, que un lector no cree pines en ULs ajenas, y que un
// GPS sin señal no deje un pin en medio del océano.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => { await connect() })
afterEach(async () => {
  await clearDatabase()
  require('../utils/cache').invalidarUls()
})
afterAll(async () => { await closeDatabase() })

const UL = 'E3550001'
const alta = (token, cuerpo) =>
  request(app).post('/api/medidores/desde-toes').set('Authorization', `Bearer ${token}`).send(cuerpo)
const cuerpo = (extra = {}) => ({
  instalacion: 'E714999999', ul: UL, lat: -35.4246, lng: -71.6554,
  serie: '95125738', marca: 'SCHLUMBERGER', ciclo: '2026-10-14', fecha: '2026-10-14T19:53:21.971Z',
  direccion: 'LOS AROMOS S/N SECTOR UNO PUEBLO', poste: '6-015613',
  ...extra,
})

describe('POST /api/medidores/desde-toes', () => {
  test('crea el pin con el GPS, la serie, la marca, la dirección y el poste, y queda pendiente', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await alta(token, cuerpo())

    expect(res.status).toBe(201)
    expect(res.body.creado).toBe(true)
    const m = await Medidor.findOne({ instalacion: 'E714999999' })
    expect(m.ubicacion.coordinates).toEqual([-71.6554, -35.4246])
    expect(m.unidadDeLectura).toBe(UL)
    expect(m.numeroDeSerie).toBe('95125738')
    expect(m.marca).toBe('SCHLUMBERGER')
    expect(m.estado).toBe('pendiente')
    expect(m.desdeToes.ciclo).toBe('2026-10-14')
    expect(m.direccion).toBe('LOS AROMOS S/N SECTOR UNO PUEBLO')
    expect(m.numeroDePoste).toBe('6-015613')
    expect(m.historial[0].accion).toMatch(/creado desde TOES/)
  })

  test('no toca un medidor que ya existe, aunque esté en otra UL', async () => {
    await Medidor.create({
      instalacion: 'E714999999', unidadDeLectura: 'OTRA',
      ubicacion: { type: 'Point', coordinates: [-71.1, -35.1] },
    })
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await alta(token, cuerpo())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ creado: false, unidadDeLectura: 'OTRA' })
    const m = await Medidor.findOne({ instalacion: 'E714999999' })
    expect(m.unidadDeLectura).toBe('OTRA')
    expect(m.ubicacion.coordinates).toEqual([-71.1, -35.1])
  })

  test('dos veces el mismo servicio deja un solo pin', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await alta(token, cuerpo())
    await alta(token, cuerpo())
    expect(await Medidor.countDocuments({ instalacion: 'E714999999' })).toBe(1)
  })

  test('un GPS sin señal o fuera de Chile no crea nada', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    expect((await alta(token, cuerpo({ lat: 0, lng: 0 }))).status).toBe(400)
    expect((await alta(token, cuerpo({ lat: 40.4, lng: -3.7 }))).status).toBe(400)
    expect((await alta(token, cuerpo({ lat: 'x' }))).status).toBe(400)
    expect(await Medidor.countDocuments()).toBe(0)
  })

  test('un lector solo crea pines en sus ULs', async () => {
    const { token: ajeno } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['OTRA'] })
    const { token: propio } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    expect((await alta(ajeno, cuerpo())).status).toBe(403)
    expect((await alta(propio, cuerpo())).status).toBe(201)
  })

  test('no acepta la lectura aunque venga', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await alta(token, cuerpo({ lectura: '98765', READINGRESULT: '98765' }))
    const m = await Medidor.findOne({ instalacion: 'E714999999' }).lean()
    expect(JSON.stringify(m)).not.toMatch(/98765/)
  })

  test('completa dirección y poste de un pin que creó desde TOES sin ellos', async () => {
    await Medidor.create({
      instalacion: 'E714999999', unidadDeLectura: UL, desdeToes: { ciclo: '2026-10-14' },
      ubicacion: { type: 'Point', coordinates: [-71.1, -35.1] },
    })
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await alta(token, cuerpo())

    expect(res.body).toEqual({ creado: false, completado: true })
    const m = await Medidor.findOne({ instalacion: 'E714999999' })
    expect(m.direccion).toBe('LOS AROMOS S/N SECTOR UNO PUEBLO')
    expect(m.numeroDePoste).toBe('6-015613')
    // lo demás no se toca: ni la posición ni la UL
    expect(m.ubicacion.coordinates).toEqual([-71.1, -35.1])
    expect(m.historial.at(-1).accion).toMatch(/completado desde TOES: direccion y numeroDePoste/)
  })

  test('al completar no pisa lo que ya tenía', async () => {
    await Medidor.create({
      instalacion: 'E714999999', unidadDeLectura: UL, desdeToes: {}, direccion: 'CORREGIDA A MANO',
    })
    const { token } = await crearUsuarioYObtenerToken('admin')

    await alta(token, cuerpo())

    const m = await Medidor.findOne({ instalacion: 'E714999999' })
    expect(m.direccion).toBe('CORREGIDA A MANO')
    expect(m.numeroDePoste).toBe('6-015613')
  })

  test('no completa un pin de MLA aunque le falte la dirección', async () => {
    await Medidor.create({ instalacion: 'E714999999', unidadDeLectura: UL })
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await alta(token, cuerpo())

    expect(res.body.completado).toBeUndefined()
    expect((await Medidor.findOne({ instalacion: 'E714999999' })).direccion).toBeNull()
  })
})

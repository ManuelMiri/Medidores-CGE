// tests/cambioMedidor.test.js
// Cuando el lector cambia un medidor en terreno, TOES deja en el log la serie
// y la marca nuevas (bloque /CambioMedidor, caso real E713709426 del
// 2026-10-14). La app lo manda acá para que la base quede igual que SAP, y el
// próximo que llegue al punto no busque un medidor que ya no existe.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => { await connect() })
afterEach(async () => { await clearDatabase() })
afterAll(async () => { await closeDatabase() })

const UL = 'E3550001'

const cambiar = (token, inst, cuerpo) =>
  request(app)
    .post(`/api/medidores/${inst}/cambio-medidor`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo)

async function crear(extra = {}) {
  return Medidor.create({
    instalacion: 'E713709426',
    unidadDeLectura: UL,
    numeroDeSerie: '95125738',
    marca: 'SCHLUMBERGER',
    ...extra,
  })
}

describe('POST /api/medidores/:instalacion/cambio-medidor', () => {
  test('reemplaza serie y marca y deja el anterior registrado', async () => {
    await crear()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await cambiar(token, 'E713709426', {
      serie: '20250209283', marca: 'ENERTEC', serieAnterior: '95125738',
      ciclo: '2026-10-14', fecha: '2026-10-14T19:53:21.920Z',
    })

    expect(res.status).toBe(200)
    expect(res.body.numeroDeSerie).toBe('20250209283')
    expect(res.body.marca).toBe('ENERTEC')
    expect(res.body.cambioMedidor).toMatchObject({
      cual: 'principal',
      serieAnterior: '95125738',
      marcaAnterior: 'SCHLUMBERGER',
      serieNueva: '20250209283',
      marcaNueva: 'ENERTEC',
      ciclo: '2026-10-14',
    })
    expect(res.body.historial.at(-1).accion).toMatch(/95125738 \(SCHLUMBERGER\) → 20250209283 \(ENERTEC\)/)
  })

  test('es idempotente: el mismo cambio dos veces no agrega historial', async () => {
    await crear()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const cuerpo = { serie: '20250209283', marca: 'ENERTEC' }

    await cambiar(token, 'E713709426', cuerpo)
    const res = await cambiar(token, 'E713709426', cuerpo)

    expect(res.status).toBe(200)
    expect(res.body.historial).toHaveLength(1)
  })

  test('si la serie vieja era la del lupa, cambia el lupa y no el principal', async () => {
    await crear({ medidorLupa: { numeroDeSerie: '777', marca: 'ELSTER' } })
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await cambiar(token, 'E713709426', { serie: '888', marca: 'ENERTEC', serieAnterior: '777' })

    expect(res.body.numeroDeSerie).toBe('95125738')
    expect(res.body.medidorLupa).toEqual({ numeroDeSerie: '888', marca: 'ENERTEC' })
    expect(res.body.cambioMedidor).toMatchObject({ cual: 'lupa', serieAnterior: '777' })
  })

  test('un lector puede registrarlo en su UL, no en una ajena', async () => {
    await crear()
    const { token: propio } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    const { token: ajeno } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['OTRA'] })

    expect((await cambiar(ajeno, 'E713709426', { serie: '1' })).status).toBe(404)
    expect((await cambiar(propio, 'E713709426', { serie: '1' })).status).toBe(200)
  })

  test('sin serie no hace nada', async () => {
    await crear()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await cambiar(token, 'E713709426', { marca: 'ENERTEC' })

    expect(res.status).toBe(400)
    expect((await Medidor.findOne({ instalacion: 'E713709426' })).numeroDeSerie).toBe('95125738')
  })

  test('el PATCH general sigue sin dejar tocar cambioMedidor', async () => {
    await crear()
    const { token } = await crearUsuarioYObtenerToken('admin')

    await request(app)
      .patch('/api/medidores/E713709426')
      .set('Authorization', `Bearer ${token}`)
      .send({ cambioMedidor: { serieNueva: 'X' } })

    expect((await Medidor.findOne({ instalacion: 'E713709426' })).cambioMedidor).toBeUndefined()
  })
})

// tests/marcaPermanente.test.js
// La marca permanente es lo único del mapa que sobrevive al cierre de ciclo,
// así que lo que se protege acá es quién puede ponerla y quién decidirla:
// el lector reporta desde terreno, pero descartar un punto para los próximos
// meses es decisión de un admin o un supervisor.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => { await connect() })
afterEach(async () => { await clearDatabase() })
afterAll(async () => { await closeDatabase() })

const UL = 'E3542002'

async function crearMedidor(instalacion = '103217288') {
  return Medidor.create({
    instalacion,
    unidadDeLectura: UL,
    ubicacion: { type: 'Point', coordinates: [-71.65, -35.5] },
  })
}

const proponer = (token, inst, cuerpo) =>
  request(app)
    .post(`/api/medidores/${inst}/marca`)
    .set('Authorization', `Bearer ${token}`)
    .send(cuerpo)

const confirmar = (token, inst) =>
  request(app).patch(`/api/medidores/${inst}/marca`).set('Authorization', `Bearer ${token}`)

const quitar = (token, inst) =>
  request(app).delete(`/api/medidores/${inst}/marca`).set('Authorization', `Bearer ${token}`)

describe('POST /api/medidores/:instalacion/marca — proponer', () => {
  test('sin token no se puede', async () => {
    await crearMedidor()
    const res = await request(app)
      .post('/api/medidores/103217288/marca')
      .send({ tipo: 'sitioEriazo' })
    expect(res.status).toBe(401)
  })

  test('un lector puede proponer sobre una UL suya y queda como propuesta', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })

    const res = await proponer(token, '103217288', {
      tipo: 'sitioEriazo', claveToes: '26', cicloOrigen: '2026-10-06',
    })

    expect(res.status).toBe(200)
    expect(res.body.marcaPermanente.tipo).toBe('sitioEriazo')
    expect(res.body.marcaPermanente.situacion).toBe('propuesta')
    expect(res.body.marcaPermanente.claveToes).toBe('26')
    expect(res.body.marcaPermanente.cicloOrigen).toBe('2026-10-06')
    // Proponer NO descarta el punto por sí solo
    expect(res.body.estado).toBe('pendiente')
  })

  test('un lector no puede proponer sobre una UL que no es suya', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['OTRA_UL'] })

    const res = await proponer(token, '103217288', { tipo: 'sitioEriazo' })
    expect(res.status).toBe(404)
  })

  test('rechaza un tipo que no existe', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await proponer(token, '103217288', { tipo: 'loQueSea' })
    expect(res.status).toBe(400)
  })

  test('es idempotente: proponer dos veces lo mismo no duplica ni reescribe', async () => {
    // Importa porque la app la llama al leer el log y el mismo servicio
    // aparece en varias vueltas del sondeo de 5 s.
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const primera = await proponer(token, '103217288', { tipo: 'sitioEriazo', claveToes: '26' })
    const segunda = await proponer(token, '103217288', { tipo: 'sitioEriazo', claveToes: '26' })

    expect(segunda.status).toBe(200)
    expect(segunda.body.marcaPermanente.fechaPropuesta)
      .toBe(primera.body.marcaPermanente.fechaPropuesta)
  })

  test('una propuesta nueva no puede degradar una marca ya confirmada', async () => {
    await crearMedidor()
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { token: tokenLector } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })

    await proponer(tokenAdmin, '103217288', { tipo: 'sitioEriazo' })
    await confirmar(tokenAdmin, '103217288')

    const res = await proponer(tokenLector, '103217288', { tipo: 'noEncontrado' })

    expect(res.status).toBe(200)
    expect(res.body.marcaPermanente.situacion).toBe('confirmada')
    expect(res.body.marcaPermanente.tipo).toBe('sitioEriazo')
  })
})

describe('PATCH /api/medidores/:instalacion/marca — confirmar', () => {
  test('un lector NO puede confirmar', async () => {
    // El punto de toda la separación de roles.
    await crearMedidor()
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    await proponer(tokenAdmin, '103217288', { tipo: 'sitioEriazo' })

    const { token: tokenLector } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    const res = await confirmar(tokenLector, '103217288')

    expect(res.status).toBe(403)
  })

  test('un supervisor sí puede, y al confirmar el medidor queda perdido', async () => {
    await crearMedidor()
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    await proponer(tokenAdmin, '103217288', { tipo: 'sitioEriazo', claveToes: '26' })

    const { token, usuario } = await crearUsuarioYObtenerToken('supervisor')
    const res = await confirmar(token, '103217288')

    expect(res.status).toBe(200)
    expect(res.body.marcaPermanente.situacion).toBe('confirmada')
    expect(res.body.marcaPermanente.confirmadaPor).toBe(String(usuario._id))
    expect(res.body.marcaPermanente.fechaConfirmacion).toBeTruthy()
    expect(res.body.estado).toBe('perdido')
  })

  test('no se puede confirmar un medidor que no tiene marca', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await confirmar(token, '103217288')
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/medidores/:instalacion/marca — quitar', () => {
  test('un lector puede quitarla: es el lado seguro del error', async () => {
    // La app la llama sola cuando TOES registra una lectura real en un punto
    // marcado, porque esa lectura prueba que el medidor sí está.
    await crearMedidor()
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    await proponer(tokenAdmin, '103217288', { tipo: 'sitioEriazo' })
    await confirmar(tokenAdmin, '103217288')

    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    const res = await quitar(token, '103217288')

    expect(res.status).toBe(200)
    expect(res.body.marcaPermanente).toBeUndefined()
  })

  test('quitar la marca no revive el estado del medidor', async () => {
    // `estado` se edita a mano y puede estar en 'perdido' por otros motivos.
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')
    await proponer(token, '103217288', { tipo: 'noEncontrado' })
    await confirmar(token, '103217288')

    const res = await quitar(token, '103217288')
    expect(res.body.estado).toBe('perdido')
  })
})

describe('auditoría', () => {
  test('cada paso deja una entrada en el historial', async () => {
    await crearMedidor()
    const { token } = await crearUsuarioYObtenerToken('admin')

    await proponer(token, '103217288', { tipo: 'sitioEriazo', claveToes: '26' })
    await confirmar(token, '103217288')
    const res = await quitar(token, '103217288')

    const acciones = res.body.historial.map((h) => h.accion)
    expect(acciones).toEqual([
      'marca propuesta → sitioEriazo (clave 26)',
      'marca confirmada → sitioEriazo',
      'marca quitada',
    ])
  })
})

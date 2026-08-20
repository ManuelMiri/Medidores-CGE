// tests/fotos.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

// No quiero que los tests suban imágenes de verdad a Cloudinary — sería
// lento, gastaría cuota gratis, y necesitaría credenciales reales. Mockeo
// subirImagen para que devuelva una URL falsa al instante.
jest.mock('../utils/cloudinary', () => ({
  subirImagen: jest.fn().mockResolvedValue({ secure_url: 'https://cloudinary.fake/foto123.jpg' }),
}))

const request = require('supertest')
const app = require('../app')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')

const { crearUsuarioYObtenerToken } = require('./helpers')

// Igual que en importacion.test.js: /registro ahora requiere admin, así
// que uso el helper compartido que crea el usuario directo en la base.
async function crearUsuarioYLoguear(rol, unidadesLectura = []) {
  const { token } = await crearUsuarioYObtenerToken(rol, { unidadesLectura })
  return token
}

beforeAll(async () => {
  await connect()
})

afterEach(async () => {
  await clearDatabase()
  jest.clearAllMocks()
})

afterAll(async () => {
  await closeDatabase()
})

describe('POST /api/medidores/:instalacion/fotos', () => {
  test('sube una foto con nombre y coordenadas correctamente', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('nombre', 'Poste frontal')
      .field('lat', '-35.5831464')
      .field('lng', '-71.1050206')
      .attach('foto', Buffer.from('contenido falso de imagen'), 'foto.jpg')

    expect(res.status).toBe(201)
    expect(res.body.fotos).toHaveLength(1)
    expect(res.body.fotos[0].nombre).toBe('Poste frontal')
    expect(res.body.fotos[0].coordenadas).toEqual({ lat: -35.5831464, lng: -71.1050206 })
    expect(res.body.fotos[0].url).toBe('https://cloudinary.fake/foto123.jpg')
  })

  test('registra la subida en el historial del medidor', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('nombre', 'Poste frontal')
      .field('lat', '-35.58')
      .field('lng', '-71.10')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(201)
    expect(res.body.historial.at(-1).accion).toBe('Foto agregada: Poste frontal')
  })

  test('rechaza la subida sin nombre', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('lat', '-35.58')
      .field('lng', '-71.10')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(400)
  })

  test('rechaza la subida sin coordenadas válidas', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('nombre', 'Poste frontal')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(400)
  })

  test('un lector no puede subir fotos a un medidor fuera de sus ULs', async () => {
    const tokenLector = await crearUsuarioYLoguear('lector', ['E9999999'])
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenLector}`)
      .field('nombre', 'Poste frontal')
      .field('lat', '-35.58')
      .field('lng', '-71.10')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(404)
  })

  test('un lector sí puede subir fotos a un medidor dentro de sus ULs', async () => {
    const tokenLector = await crearUsuarioYLoguear('lector', ['E0000001'])
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/medidores/111111/fotos')
      .set('Authorization', `Bearer ${tokenLector}`)
      .field('nombre', 'Poste frontal')
      .field('lat', '-35.58')
      .field('lng', '-71.10')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(201)
  })

  test('devuelve 404 si el medidor no existe', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/medidores/000000/fotos')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .field('nombre', 'Poste frontal')
      .field('lat', '-35.58')
      .field('lng', '-71.10')
      .attach('foto', Buffer.from('img'), 'foto.jpg')

    expect(res.status).toBe(404)
  })
})
// tests/medidores.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
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

describe('GET /api/medidores', () => {
  test('rechaza la petición si no se envía token', async () => {
    const res = await request(app).get('/api/medidores')
    expect(res.status).toBe(401)
  })

  test('permite listar medidores con un token válido', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')

    const res = await request(app)
      .get('/api/medidores')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    // La ruta real devuelve un objeto con paginación, no un arreglo
    // directo: { total, pagina, paginas, medidores: [...] }
    expect(Array.isArray(res.body.medidores)).toBe(true)
  })
})

describe('Autorización por rol en DELETE /api/medidores/:id', () => {
  test('un usuario con rol lector no puede eliminar medidores', async () => {
    const { token } = await crearUsuarioYObtenerToken('lector')

    // Usamos un id con formato válido de MongoDB aunque no exista,
    // porque lo que probamos es que el rol se rechaza ANTES de
    // siquiera buscar el medidor en la base de datos.
    const res = await request(app)
      .delete('/api/medidores/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
  })
})
describe('GET /api/medidores/buscar', () => {
  const Medidor = require('../models/Medidor')

  async function sembrar() {
    await Medidor.create([
      { instalacion: '100001234', unidadDeLectura: 'UL_A', direccion: 'Los Aromos 12' },
      { instalacion: '200001234', unidadDeLectura: 'UL_B', direccion: 'Los Aromos 12 (casa)' },
      { instalacion: '300009999', unidadDeLectura: 'UL_C', direccion: 'Camino Real s/n' },
    ])
  }

  const buscar = (token, query) =>
    request(app).get(`/api/medidores/buscar?${query}`).set('Authorization', `Bearer ${token}`)

  test('con ul busca solo en esa UL', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await buscar(token, 'q=1234&ul=UL_A')
    expect(res.status).toBe(200)
    expect(res.body.medidores.map((m) => m.instalacion)).toEqual(['100001234'])
  })

  test('acepta varias ULs separadas por coma', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await buscar(token, 'q=Aromos&ul=UL_A,UL_B')
    expect(res.body.medidores.map((m) => m.instalacion).sort()).toEqual(['100001234', '200001234'])
  })

  test('el texto se busca literal, no como expresión regular', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('admin')
    const res = await buscar(token, `q=${encodeURIComponent('12 (casa)')}`)
    expect(res.status).toBe(200)
    expect(res.body.medidores.map((m) => m.instalacion)).toEqual(['200001234'])
  })

  test('un lector no puede buscar en una UL que no es suya', async () => {
    await sembrar()
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['UL_A'] })
    const res = await buscar(token, 'q=1234&ul=UL_B')
    expect(res.body.medidores).toEqual([])
  })
})

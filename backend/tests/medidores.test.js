// tests/medidores.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')

// Registra un usuario con el rol indicado y devuelve su
// token, para no repetir el mismo bloque de código en cada test.
async function crearUsuarioYObtenerToken(rol) {
  const email = `usuario_${rol}_${Date.now()}@test.com`
  await request(app).post('/api/auth/registro').send({
    nombre: 'Usuario Test',
    email,
    password: '123456',
    rol,
    zona: 'MAULE',
  })

  const res = await request(app).post('/api/auth/login').send({
    email,
    password: '123456',
  })
  return res.body.token
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

describe('GET /api/medidores', () => {
  test('rechaza la petición si no se envía token', async () => {
    const res = await request(app).get('/api/medidores')
    expect(res.status).toBe(401)
  })

  test('permite listar medidores con un token válido', async () => {
    const token = await crearUsuarioYObtenerToken('admin')

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
    const token = await crearUsuarioYObtenerToken('lector')

    // Usamos un id con formato válido de MongoDB aunque no exista,
    // porque lo que probamos es que el rol se rechaza ANTES de
    // siquiera buscar el medidor en la base de datos.
    const res = await request(app)
      .delete('/api/medidores/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
  })
})
// tests/auth.test.js
// Antes de cargar la app, dejamos lista la clave con la que se firman los
// tokens en este entorno de pruebas 
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')

beforeAll(async () => {
  await connect()
})

afterEach(async () => {
  await clearDatabase()
})

afterAll(async () => {
  await closeDatabase()
})

describe('POST /api/auth/registro', () => {
  test('crea un usuario nuevo y devuelve un token', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Usuario de Prueba',
      email: 'prueba@test.com',
      password: '123456',
      rol: 'admin',
      zona: 'MAULE',
    })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.usuario.email).toBe('prueba@test.com')
  })

  test('no permite registrar dos veces el mismo email', async () => {
    const datos = {
      nombre: 'Usuario Repetido',
      email: 'repetido@test.com',
      password: '123456',
      rol: 'admin',
      zona: 'MAULE',
    }

    await request(app).post('/api/auth/registro').send(datos)
    const res = await request(app).post('/api/auth/registro').send(datos)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/registro').send({
      nombre: 'Usuario Login',
      email: 'login@test.com',
      password: '123456',
      rol: 'admin',
      zona: 'MAULE',
    })
  })

  test('permite iniciar sesión con credenciales correctas', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com',
      password: '123456',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  test('rechaza el login con contraseña incorrecta', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com',
      password: 'claveIncorrecta',
    })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  test('invalida el token para que no sirva en peticiones futuras', async () => {
    await request(app).post('/api/auth/registro').send({
      nombre: 'Usuario Logout',
      email: 'logout@test.com',
      password: '123456',
      rol: 'admin',
      zona: 'MAULE',
    })

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'logout@test.com',
      password: '123456',
    })
    const token = loginRes.body.token

    // Cerramos sesión con ese token
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(logoutRes.status).toBe(200)

    // El mismo token ya no debería servir para una ruta protegida
    const perfilRes = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', `Bearer ${token}`)
    expect(perfilRes.status).toBe(401)
  })
})
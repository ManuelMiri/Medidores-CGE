// tests/auth.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const Usuario = require('../models/Usuario')
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

describe('POST /api/auth/registro', () => {
  test('rechaza la petición si no hay token', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nombre: 'Usuario Nuevo', email: 'nuevo@test.com', password: '123456', rol: 'admin',
    })
    expect(res.status).toBe(401)
  })

  test('un usuario no-admin no puede registrar usuarios nuevos', async () => {
    const { token } = await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Usuario Nuevo', email: 'nuevo@test.com', password: '123456', rol: 'lector' })

    expect(res.status).toBe(403)
  })

  test('un admin sí puede crear un usuario nuevo y recibe un token', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')

    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        nombre: 'Usuario de Prueba',
        email: 'prueba@test.com',
        password: '123456',
        rol: 'lector',
        zona: 'MAULE',
      })

    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
    expect(res.body.usuario.email).toBe('prueba@test.com')
  })

  test('no permite registrar dos veces el mismo email', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const datos = {
      nombre: 'Usuario Repetido', email: 'repetido@test.com', password: '123456', rol: 'lector',
    }

    await request(app).post('/api/auth/registro').set('Authorization', `Bearer ${tokenAdmin}`).send(datos)
    const res = await request(app).post('/api/auth/registro').set('Authorization', `Bearer ${tokenAdmin}`).send(datos)

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/login', () => {
  test('permite iniciar sesión con credenciales correctas', async () => {
    await crearUsuarioYObtenerToken('admin', { email: 'login@test.com' })

    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com',
      password: '123456',
    })

    expect(res.status).toBe(200)
    expect(res.body.token).toBeDefined()
  })

  test('rechaza el login con contraseña incorrecta', async () => {
    await crearUsuarioYObtenerToken('admin', { email: 'login@test.com' })

    const res = await request(app).post('/api/auth/login').send({
      email: 'login@test.com',
      password: 'claveIncorrecta',
    })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  test('invalida el token para que no sirva en peticiones futuras', async () => {
    await crearUsuarioYObtenerToken('admin', { email: 'logout@test.com' })

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'logout@test.com',
      password: '123456',
    })
    const token = loginRes.body.token

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
    expect(logoutRes.status).toBe(200)

    const perfilRes = await request(app)
      .get('/api/auth/perfil')
      .set('Authorization', `Bearer ${token}`)
    expect(perfilRes.status).toBe(401)
  })
})

describe('GET /api/auth/usuarios', () => {
  test('un no-admin no puede listar usuarios', async () => {
    const { token } = await crearUsuarioYObtenerToken('supervisor')

    const res = await request(app)
      .get('/api/auth/usuarios')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  test('un admin puede listar todos los usuarios, sin exponer el password', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .get('/api/auth/usuarios')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.usuarios.length).toBe(2)
    expect(res.body.usuarios[0].password).toBeUndefined()
  })
})

describe('PATCH /api/auth/usuarios/:id/rol', () => {
  test('un admin puede cambiar el rol de otro usuario', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .patch(`/api/auth/usuarios/${lector._id}/rol`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rol: 'supervisor' })

    expect(res.status).toBe(200)
    expect(res.body.rol).toBe('supervisor')
  })

  test('rechaza un rol que no existe', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .patch(`/api/auth/usuarios/${lector._id}/rol`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ rol: 'superadmin' })

    expect(res.status).toBe(400)
  })

  test('un no-admin no puede cambiar roles', async () => {
    const { token: tokenSupervisor } = await crearUsuarioYObtenerToken('supervisor')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .patch(`/api/auth/usuarios/${lector._id}/rol`)
      .set('Authorization', `Bearer ${tokenSupervisor}`)
      .send({ rol: 'admin' })

    expect(res.status).toBe(403)
  })
})

describe('PATCH /api/auth/usuarios/:id/estado', () => {
  test('un admin puede desactivar a otro usuario', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector')

    const res = await request(app)
      .patch(`/api/auth/usuarios/${lector._id}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ activo: false })

    expect(res.status).toBe(200)
    expect(res.body.activo).toBe(false)

    const usuarioActualizado = await Usuario.findById(lector._id)
    expect(usuarioActualizado.activo).toBe(false)
  })

  test('un usuario desactivado no puede volver a loguearse', async () => {
    const { token: tokenAdmin } = await crearUsuarioYObtenerToken('admin')
    const { usuario: lector } = await crearUsuarioYObtenerToken('lector', { email: 'lector@test.com' })

    await request(app)
      .patch(`/api/auth/usuarios/${lector._id}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ activo: false })

    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'lector@test.com',
      password: '123456',
    })

    expect(loginRes.status).toBe(403)
  })

  test('un admin no puede desactivarse a sí mismo', async () => {
    const { token: tokenAdmin, usuario: admin } = await crearUsuarioYObtenerToken('admin')

    const res = await request(app)
      .patch(`/api/auth/usuarios/${admin._id}/estado`)
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ activo: false })

    expect(res.status).toBe(400)
  })
})
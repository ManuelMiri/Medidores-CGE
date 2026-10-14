// tests/notasUl.test.js
// Notas de una ruta: lo que el que vuelve el mes siguiente necesita saber
// antes de llegar (la clave de un portón, un perro bravo). Lo que se protege:
// que un lector solo vea y escriba en sus ULs, que solo el autor o un
// supervisor la cambie, y que nada se borre.
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const app = require('../app')
const NotaUl = require('../models/NotaUl')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')
const { crearUsuarioYObtenerToken } = require('./helpers')

beforeAll(async () => { await connect() })
afterEach(async () => { await clearDatabase() })
afterAll(async () => { await closeDatabase() })

const UL = 'E3550001'
const conToken = (r, token) => r.set('Authorization', `Bearer ${token}`)
const listar = (token, ul = UL) => conToken(request(app).get(`/api/rutas/${ul}/notas`), token)
const crearNota = (token, texto, ul = UL) =>
  conToken(request(app).post(`/api/rutas/${ul}/notas`), token).send({ texto })
const cambiar = (token, id, cuerpo) =>
  conToken(request(app).patch(`/api/rutas/${UL}/notas/${id}`), token).send(cuerpo)

describe('Notas de la UL', () => {
  test('un lector de la UL agrega una nota y la ve', async () => {
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL], nombre: 'Luciano' })

    const res = await crearNota(token, '  Clave portón condominio Santa Isabel: 123456  ')
    const lista = await listar(token)

    expect(res.status).toBe(201)
    expect(res.body.texto).toBe('Clave portón condominio Santa Isabel: 123456')
    expect(res.body.autorNombre).toBe('Luciano')
    expect(lista.body.notas.map((n) => n.texto)).toEqual(['Clave portón condominio Santa Isabel: 123456'])
  })

  test('un lector no ve ni escribe en una UL ajena', async () => {
    const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['OTRA'] })

    expect((await listar(token)).status).toBe(403)
    expect((await crearNota(token, 'hola')).status).toBe(403)
  })

  test('no acepta una nota vacía', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    expect((await crearNota(token, '   ')).status).toBe(400)
  })

  test('ocultar no la borra: deja de listarse pero sigue en la base', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    const { body: nota } = await crearNota(token, 'Perro bravo en la parcela 12')

    const res = await cambiar(token, nota._id, { visible: false })

    expect(res.status).toBe(200)
    expect((await listar(token)).body.notas).toEqual([])
    expect(await NotaUl.countDocuments()).toBe(1)
  })

  test('editar guarda el texto anterior', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    const { body: nota } = await crearNota(token, 'Clave 1234')

    await cambiar(token, nota._id, { texto: 'Clave 5678' })

    const guardada = await NotaUl.findById(nota._id)
    expect(guardada.texto).toBe('Clave 5678')
    expect(guardada.ediciones.map((e) => e.texto)).toEqual(['Clave 1234'])
  })

  test('otro lector de la misma UL no puede cambiar una nota ajena; un supervisor sí', async () => {
    const { token: autor } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    const { token: otro } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: [UL] })
    const { token: supervisor } = await crearUsuarioYObtenerToken('supervisor')
    const { body: nota } = await crearNota(autor, 'Clave 1234')

    expect((await cambiar(otro, nota._id, { visible: false })).status).toBe(403)
    expect((await cambiar(supervisor, nota._id, { visible: false })).status).toBe(200)
  })

  test('las notas de una UL no aparecen en otra', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await crearNota(token, 'de la otra', 'OTRA')

    expect((await listar(token)).body.notas).toEqual([])
  })
})

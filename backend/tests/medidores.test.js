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

  describe('un lector y el parámetro ?ul=', () => {
    const Medidor = require('../models/Medidor')
    const punto = { type: 'Point', coordinates: [-71.6, -35.5] }
    const listar = (token, ul) =>
      request(app).get(`/api/medidores?ul=${ul}`).set('Authorization', `Bearer ${token}`)

    beforeEach(async () => {
      await Medidor.create([
        { instalacion: '1', unidadDeLectura: 'PROPIA', ubicacion: punto },
        { instalacion: '2', unidadDeLectura: 'AJENA', ubicacion: punto },
      ])
    })

    test('ve su propia UL', async () => {
      const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['PROPIA'] })
      const res = await listar(token, 'PROPIA')
      expect(res.status).toBe(200)
      expect(res.body.medidores.map((m) => m.instalacion)).toEqual(['1'])
    })

    test('no puede leer una UL ajena con solo nombrarla', async () => {
      // Antes `?ul=` iba directo al filtro y devolvía la ruta entera.
      const { token } = await crearUsuarioYObtenerToken('lector', { unidadesLectura: ['PROPIA'] })
      const res = await listar(token, 'AJENA')
      // Vacía y no 403: la app pide todas las ULs marcadas a la vez y un
      // error en una tumbaría la carga de las demás.
      expect(res.status).toBe(200)
      expect(res.body.medidores).toEqual([])
      expect(res.body.total).toBe(0)
    })

    test('un admin sigue viendo cualquier UL', async () => {
      const { token } = await crearUsuarioYObtenerToken('admin')
      const res = await listar(token, 'AJENA')
      expect(res.body.medidores.map((m) => m.instalacion)).toEqual(['2'])
    })
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

// La lista de ULs se cachea un minuto. Lo que se prueba es que crear o borrar
// medidores la invalide: si no, una ruta recién importada no aparecía y una
// recién eliminada seguía ahí hasta que venciera el TTL.
describe('GET /api/medidores/uls — caché', () => {
  const Medidor = require('../models/Medidor')
  // clearDatabase vacía la base por debajo de la API, así que la caché del
  // test anterior seguiría viva.
  beforeEach(() => require('../utils/cache').invalidarUls())

  const uls = async (token) =>
    (await request(app).get('/api/medidores/uls').set('Authorization', `Bearer ${token}`)).body.uls

  test('una UL creada aparece aunque la lista estuviera en caché', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await Medidor.create({ instalacion: '900000001', unidadDeLectura: 'UL_VIEJA' })
    expect(await uls(token)).toEqual(['UL_VIEJA'])

    const res = await request(app)
      .post('/api/medidores')
      .set('Authorization', `Bearer ${token}`)
      .send({ instalacion: '900000002', unidadDeLectura: 'UL_NUEVA' })
    expect(res.status).toBe(201)

    expect(await uls(token)).toEqual(['UL_NUEVA', 'UL_VIEJA'])
  })

  test('una ruta eliminada desaparece aunque la lista estuviera en caché', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await Medidor.create([
      { instalacion: '900000003', unidadDeLectura: 'UL_A' },
      { instalacion: '900000004', unidadDeLectura: 'UL_B' },
    ])
    expect(await uls(token)).toEqual(['UL_A', 'UL_B'])

    await request(app).delete('/api/rutas/UL_B').set('Authorization', `Bearer ${token}`)

    expect(await uls(token)).toEqual(['UL_A'])
  })

  test('al eliminar el último medidor de una UL, la UL desaparece', async () => {
    const { token } = await crearUsuarioYObtenerToken('admin')
    await Medidor.create([
      { instalacion: '900000005', unidadDeLectura: 'UL_A' },
      { instalacion: '900000006', unidadDeLectura: 'UL_SOLA' },
    ])
    expect(await uls(token)).toEqual(['UL_A', 'UL_SOLA'])

    await request(app).delete('/api/medidores/900000006').set('Authorization', `Bearer ${token}`)

    expect(await uls(token)).toEqual(['UL_A'])
  })
})

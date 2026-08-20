// tests/importacion.test.js
process.env.JWT_SECRET = 'clave_secreta_de_prueba'

const request = require('supertest')
const fs = require('fs')
const path = require('path')
const app = require('../app')
const Usuario = require('../models/Usuario')
const Medidor = require('../models/Medidor')
const { connect, clearDatabase, closeDatabase } = require('./setupTestDB')

// Armo un KML chiquito a mano, con dos placemarks, para no depender de un
// archivo externo gigante en los tests. Uno de los dos instalacion los
// vamos a insertar antes como "ya existente" en algunos tests.
const kmlDePrueba = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>E0000001</name>
    <Folder>
      <Placemark>
        <name>111111</name>
        <ExtendedData>
          <Data name="ZONA"><value>MAULE</value></Data>
          <Data name="ESTABLECIMIENTO"><value>CGE: EMPLAZ TALCA</value></Data>
          <Data name="PROCESO"><value>59.0</value></Data>
          <Data name="UNIDAD DE LECTURA"><value>E0000001</value></Data>
          <Data name="DIRECCION"><value>CALLE UNO 123</value></Data>
          <Data name="NUMERO DE POSTE"><value>6-000001</value></Data>
          <Data name="NUMERO DE SERIE"><value>20230000001</value></Data>
          <Data name="MARCA"><value></value></Data>
        </ExtendedData>
        <Point><coordinates>-71.10,-35.58,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>222222</name>
        <ExtendedData>
          <Data name="ZONA"><value>MAULE</value></Data>
          <Data name="ESTABLECIMIENTO"><value>CGE: EMPLAZ TALCA</value></Data>
          <Data name="PROCESO"><value>59.0</value></Data>
          <Data name="UNIDAD DE LECTURA"><value>E0000001</value></Data>
          <Data name="DIRECCION"><value>CALLE DOS 456</value></Data>
          <Data name="NUMERO DE POSTE"><value>6-000002</value></Data>
          <Data name="NUMERO DE SERIE"><value>20230000002</value></Data>
          <Data name="MARCA"><value></value></Data>
        </ExtendedData>
        <Point><coordinates>-71.11,-35.59,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`

const { crearUsuarioYObtenerToken } = require('./helpers')

// Antes esto creaba el usuario pegándole a /api/auth/registro. Ahora que
// esa ruta requiere ser admin, uso el helper compartido que lo crea
// directo en la base. Mantengo el mismo nombre para no reescribir cada
// test de este archivo.
async function crearUsuarioYLoguear(rol) {
  const { token } = await crearUsuarioYObtenerToken(rol)
  return token
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

describe('POST /api/importacion/preview', () => {
  test('un usuario no-admin no puede usar el preview', async () => {
    const tokenLector = await crearUsuarioYLoguear('lector')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenLector}`)
      .attach('kml', Buffer.from(kmlDePrueba), 'ruta.kml')

    expect(res.status).toBe(403)
  })

  test('detecta los medidores nuevos y no toca la base', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('kml', Buffer.from(kmlDePrueba), 'ruta.kml')

    expect(res.status).toBe(200)
    expect(res.body.totalEnKml).toBe(2)
    expect(res.body.totalNuevos).toBe(2)
    expect(res.body.nuevos.map((m) => m.instalacion).sort()).toEqual(['111111', '222222'])

    // El preview no debe crear nada en la base
    const totalMedidores = await Medidor.countDocuments()
    expect(totalMedidores).toBe(0)
  })

  test('un medidor que ya existe no aparece como nuevo', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('kml', Buffer.from(kmlDePrueba), 'ruta.kml')

    expect(res.status).toBe(200)
    expect(res.body.totalNuevos).toBe(1)
    expect(res.body.nuevos[0].instalacion).toBe('222222')
  })
})

describe('POST /api/importacion/confirmar', () => {
  test('un usuario no-admin no puede confirmar la importación', async () => {
    const tokenLector = await crearUsuarioYLoguear('lector')

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenLector}`)
      .send({ medidores: [{ instalacion: '111111' }] })

    expect(res.status).toBe(403)
  })

  test('crea solo los medidores nuevos confirmados', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const previewRes = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('kml', Buffer.from(kmlDePrueba), 'ruta.kml')

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ medidores: previewRes.body.nuevos })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(2)

    const medidorCreado = await Medidor.findOne({ instalacion: '111111' })
    expect(medidorCreado.direccion).toBe('CALLE UNO 123')
    expect(medidorCreado.ubicacion.coordinates).toEqual([-71.1, -35.58])
    expect(medidorCreado.historial[0].accion).toBe('Creado por importación de KML')
  })

  test('no falla ni duplica si un medidor ya fue creado por otra vía', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    await Medidor.create({ instalacion: '111111', unidadDeLectura: 'E0000001' })

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({
        medidores: [
          { instalacion: '111111', direccion: 'NO DEBERIA PISAR ESTE' },
          { instalacion: '222222', direccion: 'CALLE DOS 456' },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(1)
    expect(res.body.totalOmitidos).toBe(1)

    const totalMedidores = await Medidor.countDocuments()
    expect(totalMedidores).toBe(2)
  })
})
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
const XLSX = require('xlsx')

// Mismo criterio que con el KML de prueba: armo un Excel chiquito a mano
// (2 filas) para no depender de subir el archivo real de SAP a los tests.
// Las columnas son las mismas que trae el archivo real de la analista.
function generarExcelDePrueba(filas) {
  const hoja = XLSX.utils.json_to_sheet(filas)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Exportación SAPUI5')
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })
}

const excelDePrueba = generarExcelDePrueba([
  {
    ZONA: 'MAULE', ESTABLECIMIENTO: 'CGE: EMPLAZ TALCA', PROCESO: '60',
    INSTALACION: '333333', 'UNIDAD DE LECTURA': 'E0000002',
    DIRECCION: 'CALLE TRES 789', 'NUMERO DE POSTE': '6-000003',
    'NUMERO DE SERIE': '20230000003', MARCA: '',
    COORDENADAS: '-35.60, -71.12',
  },
  {
    ZONA: 'MAULE', ESTABLECIMIENTO: 'CGE: EMPLAZ TALCA', PROCESO: '60',
    INSTALACION: '444444', 'UNIDAD DE LECTURA': 'E0000002',
    DIRECCION: 'CALLE CUATRO 321', 'NUMERO DE POSTE': '6-000004',
    'NUMERO DE SERIE': '20230000004', MARCA: '',
    COORDENADAS: '-35.61, -71.13',
  },
])

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
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml')

    expect(res.status).toBe(403)
  })

  test('detecta los medidores nuevos y no toca la base', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml')

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
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml')

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
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml')

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ medidores: previewRes.body.nuevos })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(2)

    const medidorCreado = await Medidor.findOne({ instalacion: '111111' })
    expect(medidorCreado.direccion).toBe('CALLE UNO 123')
    expect(medidorCreado.ubicacion.coordinates).toEqual([-71.1, -35.58])
    expect(medidorCreado.historial[0].accion).toBe('Creado por importación de ruta')
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

  test('acepta una ruta grande: el cuerpo pasa los 100 KB por defecto de Express', async () => {
    // Caso real: la E3509011 trae 515 medidores (~176 KB de JSON) y el
    // confirmar daba 413. Se arma una de 600 con campos de largo parecido.
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    const medidores = Array.from({ length: 600 }, (_, i) => ({
      instalacion: String(103000000 + i),
      zona: 'MAULE',
      establecimiento: 'CGE: EMPLAZ TALCA',
      proceso: 9,
      unidadDeLectura: 'E3509011',
      direccion: 'CAMINO RURAL S/N LOTE ' + i + ' YERBAS BUENAS SECTOR ORIENTE',
      numeroDePoste: '6-000719',
      numeroDeSerie: '20250205707',
      marca: null,
      ubicacion: { type: 'Point', coordinates: [-71.6369835, -35.5869795] },
    }))
    expect(Buffer.byteLength(JSON.stringify({ medidores }))).toBeGreaterThan(150 * 1024)

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ medidores })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(600)
  })
})

describe('Importación desde Excel de SAP (.xlsx)', () => {
  test('el preview detecta los medidores nuevos desde el Excel', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', excelDePrueba, 'ruta.xlsx')

    expect(res.status).toBe(200)
    expect(res.body.totalEnKml).toBe(2)
    expect(res.body.totalNuevos).toBe(2)
    expect(res.body.nuevos.map((m) => m.instalacion).sort()).toEqual(['333333', '444444'])
  })

  test('invierte correctamente lat/lng al armar las coordenadas', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', excelDePrueba, 'ruta.xlsx')

    const medidor333 = res.body.nuevos.find((m) => m.instalacion === '333333')
    // El Excel trae "-35.60, -71.12" (lat, lng) — en GeoJSON va [lng, lat].
    expect(medidor333.ubicacion.coordinates).toEqual([-71.12, -35.60])
  })

  test('confirmar crea los medidores del Excel igual que con KML', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const previewRes = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', excelDePrueba, 'ruta.xlsx')

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ medidores: previewRes.body.nuevos })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(2)

    const medidorCreado = await Medidor.findOne({ instalacion: '333333' })
    expect(medidorCreado.direccion).toBe('CALLE TRES 789')
  })

  test('rechaza un archivo con extensión no soportada', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from('cualquier cosa'), 'ruta.pdf')

    expect(res.status).toBe(400)
  })
})

// El formato se decide por el CONTENIDO y no por el nombre, y estos tests son
// los que lo sostienen. El caso que lo motivó es el de todos los días: al
// descargar un KML de Google My Maps desde el teléfono, Android lo guarda como
// `ruta.kml.xml`, y con la extensión como criterio el archivo se rechazaba.
describe('El nombre del archivo no decide el formato', () => {
  test('un KML descargado desde el teléfono (.kml.xml) se importa igual', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml.xml')

    expect(res.status).toBe(200)
    expect(res.body.totalNuevos).toBeGreaterThan(0)
  })

  test('un KML sin ninguna extensión también', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta')

    expect(res.status).toBe(200)
    expect(res.body.totalNuevos).toBeGreaterThan(0)
  })

  test('un Excel con el nombre cambiado se sigue leyendo como Excel', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', excelDePrueba, 'descarga.bin')

    expect(res.status).toBe(200)
    expect(res.body.totalNuevos).toBeGreaterThan(0)
  })

  test('un .xml que NO es un KML se rechaza, aunque sea XML válido', async () => {
    // Mirar el contenido no puede significar aceptar cualquier cosa: un XML
    // de otra cosa tiene que seguir fallando, y con un mensaje que se entienda.
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from('<?xml version="1.0"?><factura><total>10</total></factura>'), 'ruta.kml')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/No reconozco el archivo/i)
  })

  test('un KMZ avisa que hay que exportar como KML, en vez de fallar raro', async () => {
    // Un KMZ es un ZIP, igual que un XLSX. Sin distinguirlos, terminaria en el
    // parser de Excel y el admin veria un error que no le dice que hacer.
    // Se arma un ZIP minimo a mano: cabecera local + el nombre doc.kml.
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(26),
      Buffer.from('doc.kml'),
    ])
    const tokenAdmin = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', zip, 'ruta.kmz')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/KMZ/i)
  })
})

describe('Importar invalida la lista de ULs en caché', () => {
  test('la UL importada aparece al tiro en /api/medidores/uls', async () => {
    const tokenAdmin = await crearUsuarioYLoguear('admin')
    const uls = async () => (await request(app)
      .get('/api/medidores/uls')
      .set('Authorization', `Bearer ${tokenAdmin}`)).body.uls

    // Deja la lista (vacía) en caché antes de importar.
    expect(await uls()).toEqual([])

    const previewRes = await request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .attach('archivo', Buffer.from(kmlDePrueba), 'ruta.kml')
    await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${tokenAdmin}`)
      .send({ medidores: previewRes.body.nuevos })

    const esperadas = (await Medidor.distinct('unidadDeLectura')).filter(Boolean).sort()
    expect(esperadas.length).toBeGreaterThan(0)
    expect(await uls()).toEqual(esperadas)
  })
})

describe('Instalaciones repetidas dentro del archivo', () => {
  // Caso real G3509004: el archivo traía una instalación 4 veces, otra 2 veces
  // copiada igual y otra 2 veces con dos medidores distintos. El confirmar
  // cortaba con E11000 y dejaba la ruta a medias.
  const fila = (instalacion, serie) => ({
    ZONA: 'MAULE', ESTABLECIMIENTO: 'CGE: EMPLAZ TALCA', PROCESO: '09',
    INSTALACION: instalacion, 'UNIDAD DE LECTURA': 'G0000001',
    DIRECCION: 'CAMINO S/N', 'NUMERO DE POSTE': '1',
    'NUMERO DE SERIE': serie, MARCA: '',
    COORDENADAS: '-35.44, -71.67',
  })
  const excelConRepetidos = generarExcelDePrueba([
    fila('G0000001', 'S1'),
    fila('100855065', 'S2'), fila('100855065', 'S2'), fila('100855065', 'S2'), fila('100855065', 'S2'),
    fila('G0000002', 'S3'), fila('G0000002', 'OTRO'),
  ])

  async function preview(token) {
    return request(app)
      .post('/api/importacion/preview')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', excelConRepetidos, 'ruta.xlsx')
  }

  test('el preview deja una fila por instalación y avisa cuáles venían repetidas', async () => {
    const res = await preview(await crearUsuarioYLoguear('admin'))

    expect(res.status).toBe(200)
    expect(res.body.totalFilas).toBe(7)
    expect(res.body.totalEnKml).toBe(3)
    expect(res.body.nuevos.map((m) => m.instalacion).sort()).toEqual(['100855065', 'G0000001', 'G0000002'])
    const porInst = Object.fromEntries(res.body.repetidos.map((r) => [r.instalacion, r]))
    expect(porInst['100855065']).toEqual({ instalacion: '100855065', veces: 4, lupa: null, otrosMedidores: [] })
    // dos medidores en una instalación: el segundo es el lupa del poste
    expect(porInst['G0000002'].lupa).toBe('OTRO')
    const conLupa = res.body.nuevos.find((m) => m.instalacion === 'G0000002')
    expect(conLupa.numeroDeSerie).toBe('S3') // el de la casa sigue siendo el principal
    expect(conLupa.medidorLupa.numeroDeSerie).toBe('OTRO')
    expect(res.body.nuevos.find((m) => m.instalacion === 'G0000001').medidorLupa).toBeUndefined()
  })

  test('el lupa se guarda al crear el medidor', async () => {
    const token = await crearUsuarioYLoguear('admin')
    const { body } = await preview(token)
    await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: body.nuevos })

    const m = await Medidor.findOne({ instalacion: 'G0000002' })
    expect(m.numeroDeSerie).toBe('S3')
    expect(m.medidorLupa.numeroDeSerie).toBe('OTRO')
    // y uno sin lupa no queda con un objeto vacío
    const sin = await Medidor.findOne({ instalacion: 'G0000001' }).lean()
    expect(sin.medidorLupa).toBeUndefined()
  })

  test('a un medidor que ya existía sin lupa se le agrega, sin tocar lo demás', async () => {
    // Caso G3558832: quedó creado por un import cortado, antes de los lupas.
    await Medidor.create({ instalacion: 'G0000002', unidadDeLectura: 'G0000001', numeroDeSerie: 'S3', estado: 'localizado' })
    const token = await crearUsuarioYLoguear('admin')
    const { body } = await preview(token)

    expect(body.nuevos.map((m) => m.instalacion)).not.toContain('G0000002')
    expect(body.lupasNuevas).toEqual([{ instalacion: 'G0000002', medidorLupa: { numeroDeSerie: 'OTRO', marca: null } }])

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: body.nuevos, lupas: body.lupasNuevas })

    expect(res.body.lupasAgregados).toBe(1)
    const m = await Medidor.findOne({ instalacion: 'G0000002' })
    expect(m.medidorLupa.numeroDeSerie).toBe('OTRO')
    expect(m.estado).toBe('localizado') // lo de terreno no se toca
    expect(m.historial.at(-1).accion).toContain('lupa')
  })

  test('solo lupas, sin medidores nuevos, también se puede confirmar', async () => {
    await Medidor.create({ instalacion: 'G0000002', unidadDeLectura: 'G0000001' })
    const token = await crearUsuarioYLoguear('admin')

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: [], lupas: [{ instalacion: 'G0000002', medidorLupa: { numeroDeSerie: 'OTRO' } }] })

    expect(res.status).toBe(201)
    expect(res.body.lupasAgregados).toBe(1)
  })

  test('nunca pisa un lupa que ya estaba guardado', async () => {
    await Medidor.create({
      instalacion: 'G0000002', unidadDeLectura: 'G0000001',
      medidorLupa: { numeroDeSerie: 'ORIGINAL', marca: 'X' },
    })
    const token = await crearUsuarioYLoguear('admin')

    const { body } = await preview(token)
    expect(body.lupasNuevas).toEqual([])

    // ni aunque alguien lo mande igual (un preview viejo, por ejemplo)
    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: [], lupas: [{ instalacion: 'G0000002', medidorLupa: { numeroDeSerie: 'OTRO' } }] })

    expect(res.body.lupasAgregados).toBe(0)
    const m = await Medidor.findOne({ instalacion: 'G0000002' })
    expect(m.medidorLupa.numeroDeSerie).toBe('ORIGINAL')
  })

  test('confirmar con la lista del preview crea todo sin E11000', async () => {
    const token = await crearUsuarioYLoguear('admin')
    const { body } = await preview(token)

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: body.nuevos })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(3)
    expect(await Medidor.countDocuments()).toBe(3)
  })

  test('confirmar también aguanta repetidos que mande un APK viejo', async () => {
    const token = await crearUsuarioYLoguear('admin')
    const m = { instalacion: '100855065', unidadDeLectura: 'G0000001' }

    const res = await request(app)
      .post('/api/importacion/confirmar')
      .set('Authorization', `Bearer ${token}`)
      .send({ medidores: [m, m, m, { instalacion: 'G0000001', unidadDeLectura: 'G0000001' }] })

    expect(res.status).toBe(201)
    expect(res.body.totalCreados).toBe(2)
    expect(res.body.totalOmitidos).toBe(2)
  })
})

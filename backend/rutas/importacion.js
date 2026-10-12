// rutas/importacion.js
// Le permite al admin subir la ruta de un lector — sea el KML de Google My
// Maps o el Excel que la analista descarga de SAP — y crea solo los
// medidores que sean nuevos. Los que ya existen en la base NUNCA se
// sobreescriben, porque ya pueden tener estado, fotos o historial de
// terreno cargado por un técnico.
const express = require('express')
const router = express.Router()
const multer = require('multer')
const { proteger, soloRol } = require('../middleware/auth')
const Medidor = require('../models/Medidor')
const { parsearKml } = require('../utils/kml')
const { parsearExcelSap } = require('../utils/excelSap')

// Guardamos el archivo en memoria (req.file.buffer), no en disco. Railway
// no tiene almacenamiento persistente y de todas formas solo necesitamos
// el archivo un instante para parsearlo.
const upload = multer({ storage: multer.memoryStorage() })

/**
 * Qué formato es el archivo, mirando el CONTENIDO y no el nombre.
 *
 * Antes se decidía con la extensión, y eso dejaba afuera el caso normal de
 * trabajar desde el teléfono: al descargar un KML de Google My Maps, Android
 * lo guarda como `ruta.kml.xml`. La extensión pasa a ser `.xml`, el archivo se
 * rechazaba con "formato no soportado" y encima el selector de archivos ni
 * siquiera lo dejaba elegir. Lo mismo con un archivo sin extensión, o con uno
 * que alguien renombró.
 *
 * El contenido, en cambio, no miente. Son tres firmas:
 *
 *   - XLSX es un ZIP, y todo ZIP empieza con "PK".
 *   - El .xls viejo es un OLE compound document (D0 CF 11 E0).
 *   - KML es XML y lleva una etiqueta <kml cerca del principio.
 */
function formatoDe(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
    // Un KMZ (KML comprimido) también es un ZIP, así que hay que distinguirlo
    // o terminaría en el parser de Excel con un error que no le dice nada a
    // nadie. Los nombres de los archivos van en claro dentro del ZIP, así que
    // alcanza con buscarlos.
    return buffer.toString('latin1').includes('.kml') ? 'kmz' : 'excel'
  }
  if (buffer.length >= 4 &&
      buffer[0] === 0xd0 && buffer[1] === 0xcf &&
      buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return 'excel'
  }

  // Solo el principio: un KML de una ruta entera puede pesar varios MB y no
  // hace falta leerlo completo para saber qué es.
  if (buffer.subarray(0, 2048).toString('utf8').toLowerCase().includes('<kml')) {
    return 'kml'
  }

  return null
}

// Los dos parsers devuelven exactamente la misma forma de datos, así que el
// resto de la ruta (comparar contra la base, armar el preview, confirmar) no
// necesita saber de dónde vino el archivo.
function parsearArchivoRuta(archivo) {
  const formato = formatoDe(archivo.buffer)

  if (formato === 'kml') {
    return parsearKml(archivo.buffer.toString('utf8'))
  }
  if (formato === 'excel') {
    return parsearExcelSap(archivo.buffer)
  }
  if (formato === 'kmz') {
    throw new Error(
      'El archivo es un KMZ (un KML comprimido) y todavía no se puede leer. ' +
      'En Google My Maps, al exportar, elige "KML" en vez de "KMZ".'
    )
  }
  throw new Error(
    'No reconozco el archivo. Tiene que ser el .kml de Google My Maps o el ' +
    'Excel de SAP. El nombre no importa: se mira el contenido, así que un ' +
    '.kml.xml bajado desde el teléfono sirve igual.'
  )
}

// POST /api/importacion/preview
// Recibe el archivo, lo parsea y devuelve los medidores que todavía NO
// existen en la base (comparando por número de instalación). No escribe
// nada.
router.post(
  '/preview',
  proteger,
  soloRol('admin'),
  upload.single('archivo'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Debes adjuntar un archivo (.kml, .xlsx o .xls)' })
      }

      const medidoresDelArchivo = parsearArchivoRuta(req.file)

      if (medidoresDelArchivo.length === 0) {
        return res.status(400).json({ error: 'El archivo no contiene medidores válidos' })
      }

      const instalaciones = medidoresDelArchivo.map((m) => m.instalacion)
      const existentes = await Medidor.find({
        instalacion: { $in: instalaciones },
      }).select('instalacion')
      const instalacionesExistentes = new Set(existentes.map((m) => m.instalacion))

      const nuevos = medidoresDelArchivo.filter(
        (m) => !instalacionesExistentes.has(m.instalacion)
      )

      res.json({
        totalEnKml: medidoresDelArchivo.length,
        totalExistentes: instalacionesExistentes.size,
        totalNuevos: nuevos.length,
        nuevos,
      })
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  }
)

// POST /api/importacion/confirmar
// Recibe la lista de medidores nuevos que el admin ya revisó en el preview
// y los crea. Si alguno ya existe (por ejemplo, otro admin lo creó justo
// entre el preview y la confirmación), lo salta en vez de fallar todo.
router.post('/confirmar', proteger, soloRol('admin'), async (req, res) => {
  try {
    const { medidores } = req.body

    if (!Array.isArray(medidores) || medidores.length === 0) {
      return res.status(400).json({ error: 'No hay medidores para importar' })
    }

    const instalaciones = medidores.map((m) => m.instalacion)
    const yaExisten = await Medidor.find({
      instalacion: { $in: instalaciones },
    }).select('instalacion')
    const instalacionesExistentes = new Set(yaExisten.map((m) => m.instalacion))

    const aCrear = medidores
      .filter((m) => m.instalacion && !instalacionesExistentes.has(m.instalacion))
      .map((m) => ({
        ...m,
        historial: [
          {
            usuario: req.usuario._id,
            nombre: req.usuario.nombre,
            accion: 'Creado por importación de ruta',
          },
        ],
      }))

    const creados = aCrear.length > 0 ? await Medidor.insertMany(aCrear) : []

    res.status(201).json({
      totalCreados: creados.length,
      totalOmitidos: medidores.length - creados.length,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
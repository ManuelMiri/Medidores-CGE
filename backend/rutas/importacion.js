// rutas/importacion.js
// Le permite al admin subir la ruta de un lector — sea el KML de Google My
// Maps o el Excel que la analista descarga de SAP — y crea solo los
// medidores que sean nuevos. Los que ya existen en la base NUNCA se
// sobreescriben, porque ya pueden tener estado, fotos o historial de
// terreno cargado por un técnico.
const express = require('express')
const router = express.Router()
const multer = require('multer')
const path = require('path')
const { proteger, soloRol } = require('../middleware/auth')
const Medidor = require('../models/Medidor')
const { parsearKml } = require('../utils/kml')
const { parsearExcelSap } = require('../utils/excelSap')

// Guardamos el archivo en memoria (req.file.buffer), no en disco. Railway
// no tiene almacenamiento persistente y de todas formas solo necesitamos
// el archivo un instante para parsearlo.
const upload = multer({ storage: multer.memoryStorage() })

// Según la extensión del archivo, uso un parser u otro. Los dos devuelven
// exactamente la misma forma de datos, así que el resto de la ruta
// (comparar contra la base, armar el preview, confirmar) no necesita
// saber de dónde vino el archivo.
function parsearArchivoRuta(archivo) {
  const extension = path.extname(archivo.originalname).toLowerCase()

  if (extension === '.kml') {
    return parsearKml(archivo.buffer.toString('utf8'))
  }
  if (extension === '.xlsx' || extension === '.xls') {
    return parsearExcelSap(archivo.buffer)
  }
  throw new Error(`Formato de archivo no soportado: ${extension || '(sin extensión)'}. Usa .kml, .xlsx o .xls`)
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
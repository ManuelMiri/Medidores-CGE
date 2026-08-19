// rutas/importacion.js
// Le permite al admin subir el KML de una ruta (UL) y crear solo los
// medidores que sean nuevos. Los que ya existen en la base NUNCA se
// sobreescriben, porque ya pueden tener estado, fotos o historial de
// terreno cargado por un técnico.
const express = require('express')
const router = express.Router()
const multer = require('multer')
const { proteger, soloRol } = require('../middleware/auth')
const Medidor = require('../models/Medidor')
const { parsearKml } = require('../utils/kml')

// Guardamos el archivo en memoria (req.file.buffer), no en disco. Railway
// no tiene almacenamiento persistente y de todas formas solo necesitamos
// el archivo un instante para parsearlo.
const upload = multer({ storage: multer.memoryStorage() })

// POST /api/importacion/preview
// Recibe el KML, lo parsea y devuelve los medidores que todavía NO existen
// en la base (comparando por número de instalación). No escribe nada.
router.post(
  '/preview',
  proteger,
  soloRol('admin'),
  upload.single('kml'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Debes adjuntar un archivo KML' })
      }

      const kmlTexto = req.file.buffer.toString('utf8')
      const medidoresDelKml = parsearKml(kmlTexto)

      if (medidoresDelKml.length === 0) {
        return res.status(400).json({ error: 'El KML no contiene medidores válidos' })
      }

      const instalaciones = medidoresDelKml.map((m) => m.instalacion)
      const existentes = await Medidor.find({
        instalacion: { $in: instalaciones },
      }).select('instalacion')
      const instalacionesExistentes = new Set(existentes.map((m) => m.instalacion))

      const nuevos = medidoresDelKml.filter(
        (m) => !instalacionesExistentes.has(m.instalacion)
      )

      res.json({
        totalEnKml: medidoresDelKml.length,
        totalExistentes: instalacionesExistentes.size,
        totalNuevos: nuevos.length,
        nuevos,
      })
    } catch (err) {
      res.status(500).json({ error: err.message })
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
            accion: 'Creado por importación de KML',
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
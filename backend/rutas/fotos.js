// rutas/fotos.js
// Endpoint para que un técnico en terreno le suba una foto a un medidor.
// Va separado de medidores.js para que cada archivo se encargue de una
// sola cosa: este solo sabe de fotos.
const express = require('express')
const router = express.Router()
const multer = require('multer')
const { proteger } = require('../middleware/auth')
const Medidor = require('../models/Medidor')
const { subirImagen } = require('../utils/cloudinary')

// Igual que en importación: guardamos el archivo en memoria, nunca en
// disco, porque Railway no tiene almacenamiento persistente.
const upload = multer({ storage: multer.memoryStorage() })

// POST /api/medidores/:instalacion/fotos
// Body (multipart/form-data): foto (archivo), nombre, lat, lng
// Cualquier usuario autenticado puede subir fotos (lector, supervisor o
// admin) — es trabajo de terreno, no una tarea administrativa.
router.post('/:instalacion/fotos', proteger, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar una foto' })
    }

    const { nombre, lat, lng } = req.body
    const latNum = parseFloat(lat)
    const lngNum = parseFloat(lng)

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: 'El nombre de la foto es obligatorio' })
    }
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return res.status(400).json({ error: 'Se requieren coordenadas (lat/lng) válidas' })
    }

    const filtro = { instalacion: req.params.instalacion }
    if (req.usuario.rol === 'lector') {
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }

    const medidor = await Medidor.findOne(filtro)
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })

    const resultado = await subirImagen(req.file.buffer)

    medidor.fotos.push({
      url: resultado.secure_url,
      nombre: nombre.trim(),
      coordenadas: { lat: latNum, lng: lngNum },
      subidoPor: req.usuario._id,
    })
    medidor.historial.push({
      usuario: req.usuario._id,
      nombre: req.usuario.nombre,
      accion: `Foto agregada: ${nombre.trim()}`,
    })

    await medidor.save()

    res.status(201).json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
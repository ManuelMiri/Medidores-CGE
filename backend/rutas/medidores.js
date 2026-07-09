// rutas/medidores.js
const express = require('express')
const router = express.Router()
const Medidor = require('../models/Medidor')
const { proteger } = require('../middleware/auth')

// GET /api/medidores
// Lista todos los medidores (con paginación)
router.get('/', async (req, res) => {
  try {
    const pagina = parseInt(req.query.pagina) || 1
    const limite = parseInt(req.query.limite) || 20
    const estado = req.query.estado || null
    const skip   = (pagina - 1) * limite

    const filtro = {}
    if (estado) filtro.estado = estado

    const [medidores, total] = await Promise.all([
      Medidor.find(filtro).skip(skip).limit(limite).select('-__v'),
      Medidor.countDocuments(filtro),
    ])

    res.json({
      total,
      pagina,
      paginas: Math.ceil(total / limite),
      medidores,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/buscar?q=102243462
// Busca por número de instalación, dirección o número de poste
router.get('/buscar', async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })

    const medidores = await Medidor.find({
      $or: [
        { instalacion:   { $regex: q, $options: 'i' } },
        { direccion:     { $regex: q, $options: 'i' } },
        { numeroDePoste: { $regex: q, $options: 'i' } },
        { numeroDeSerie: { $regex: q, $options: 'i' } },
      ],
    }).limit(20).select('-__v')

    res.json({ total: medidores.length, medidores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/cercanos?lng=-71.71&lat=-35.51&distancia=300
// Busca medidores cercanos a una coordenada GPS (en metros)
router.get('/cercanos', async (req, res) => {
  try {
    const lng       = parseFloat(req.query.lng)
    const lat       = parseFloat(req.query.lat)
    const distancia = parseInt(req.query.distancia) || 200

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({ error: 'Se requieren parámetros lng y lat válidos' })
    }

    const medidores = await Medidor.find({
      ubicacion: {
        $near: {
          $geometry:    { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: distancia,
        },
      },
    }).select('-__v')

    res.json({ total: medidores.length, distanciaMetros: distancia, medidores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/:instalacion
// Obtiene un medidor por su número de instalación
router.get('/:instalacion', async (req, res) => {
  try {
    const medidor = await Medidor.findOne({ instalacion: req.params.instalacion })
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado' })
    res.json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/medidores/:instalacion
// Actualiza estado, observaciones o ubicación — requiere autenticación
router.patch('/:instalacion', proteger, async (req, res) => {
  try {
    const camposPermitidos = ['estado', 'observaciones', 'ubicacion', 'fotos']
    const actualizacion = {}

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo]
    })

    if (actualizacion.estado === 'localizado') {
      actualizacion.fechaLocalizacion = new Date()
    }

    const medidor = await Medidor.findOneAndUpdate(
      { instalacion: req.params.instalacion },
      { $set: actualizacion },
      { new: true, runValidators: true }
    )

    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado' })
    res.json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
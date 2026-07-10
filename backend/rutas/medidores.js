// rutas/medidores.js
const express = require('express')
const router = express.Router()
const Medidor = require('../models/Medidor')
const { proteger, soloRol } = require('../middleware/auth')

// GET /api/medidores
// Lista medidores filtrados por UL del usuario autenticado
// Admin/supervisor ven todos si no especifican UL
router.get('/', proteger, async (req, res) => {
  try {
    const pagina   = parseInt(req.query.pagina)  || 1
    const limite   = parseInt(req.query.limite)  || 301
    const estado   = req.query.estado || null
    const ul       = req.query.ul || null // UL específica seleccionada
    const skip     = (pagina - 1) * limite

    const filtro = {}

    // Filtro por estado
    if (estado) filtro.estado = estado

    // Filtro por UL
    if (ul) {
      filtro.unidadDeLectura = ul
    } else if (req.usuario.rol === 'lector') {
      // Lector solo ve sus ULs asignadas
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }
    // Admin y supervisor ven todo si no filtran por UL

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
router.get('/buscar', proteger, async (req, res) => {
  try {
    const { q, ul } = req.query
    if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })

    const filtro = {
      $or: [
        { instalacion:   { $regex: q, $options: 'i' } },
        { direccion:     { $regex: q, $options: 'i' } },
        { numeroDePoste: { $regex: q, $options: 'i' } },
        { numeroDeSerie: { $regex: q, $options: 'i' } },
      ],
    }

    // Restringir por UL si es lector
    if (ul) {
      filtro.unidadDeLectura = ul
    } else if (req.usuario.rol === 'lector') {
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }

    const medidores = await Medidor.find(filtro).limit(20).select('-__v')
    res.json({ total: medidores.length, medidores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/cercanos?lng=-71.71&lat=-35.51&distancia=300
router.get('/cercanos', proteger, async (req, res) => {
  try {
    const lng       = parseFloat(req.query.lng)
    const lat       = parseFloat(req.query.lat)
    const distancia = parseInt(req.query.distancia) || 200
    const ul        = req.query.ul || null

    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({ error: 'Se requieren parámetros lng y lat válidos' })
    }

    const filtro = {
      ubicacion: {
        $near: {
          $geometry:    { type: 'Point', coordinates: [lng, lat] },
          $maxDistance: distancia,
        },
      },
    }

    if (ul) {
      filtro.unidadDeLectura = ul
    } else if (req.usuario.rol === 'lector') {
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }

    const medidores = await Medidor.find(filtro).select('-__v')
    res.json({ total: medidores.length, distanciaMetros: distancia, medidores })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/uls
// Devuelve las ULs disponibles según el rol del usuario
router.get('/uls', proteger, async (req, res) => {
  try {
    let uls

    if (req.usuario.rol === 'lector') {
      // Lector: solo sus ULs asignadas
      uls = req.usuario.unidadesLectura
    } else {
      // Admin/supervisor: todas las ULs que existen en la BD
      uls = await Medidor.distinct('unidadDeLectura')
      uls = uls.filter(Boolean).sort()
    }

    res.json({ uls })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/medidores/:instalacion
router.get('/:instalacion', proteger, async (req, res) => {
  try {
    const filtro = { instalacion: req.params.instalacion }

    // Lector solo puede ver medidores de sus ULs
    if (req.usuario.rol === 'lector') {
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }

    const medidor = await Medidor.findOne(filtro)
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado' })
    res.json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/medidores
// Crear nuevo medidor (técnico en terreno agrega un punto nuevo)
router.post('/', proteger, async (req, res) => {
  try {
    const {
      instalacion, zona, establecimiento, proceso,
      direccion, numeroDePoste, numeroDeSerie, marca,
      ubicacion, estado, observaciones, unidadDeLectura,
    } = req.body

    // Lector solo puede crear en sus ULs asignadas
    if (req.usuario.rol === 'lector' &&
        !req.usuario.unidadesLectura.includes(unidadDeLectura)) {
      return res.status(403).json({ error: 'No tienes acceso a esa UL' })
    }

    const medidor = await Medidor.create({
      instalacion, zona, establecimiento, proceso,
      direccion, numeroDePoste, numeroDeSerie, marca,
      ubicacion, estado: estado || 'pendiente',
      observaciones, unidadDeLectura,
      historial: [{
        usuario:   req.usuario._id,
        nombre:    req.usuario.nombre,
        accion:    'creado',
        fecha:     new Date(),
      }],
    })

    res.status(201).json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/medidores/:instalacion
// Actualizar medidor — registra auditoría
router.patch('/:instalacion', proteger, async (req, res) => {
  try {
    const camposPermitidos = [
      'estado', 'observaciones', 'ubicacion', 'fotos',
      'zona', 'establecimiento', 'proceso', 'direccion',
      'numeroDePoste', 'numeroDeSerie', 'marca',
    ]
    const actualizacion = {}

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) actualizacion[campo] = req.body[campo]
    })

    if (actualizacion.estado === 'localizado') {
      actualizacion.fechaLocalizacion = new Date()
      actualizacion.localizadoPor = req.usuario._id
    }

    // Entrada de auditoría
    const entradaHistorial = {
      usuario: req.usuario._id,
      nombre:  req.usuario.nombre,
      accion:  `modificado → estado: ${actualizacion.estado || 'sin cambio'}`,
      fecha:   new Date(),
    }

    const filtro = { instalacion: req.params.instalacion }
    if (req.usuario.rol === 'lector') {
      filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
    }

    const medidor = await Medidor.findOneAndUpdate(
      filtro,
      {
        $set: actualizacion,
        $push: { historial: entradaHistorial },
      },
      { new: true, runValidators: true }
    )

    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })
    res.json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/medidores/:instalacion — solo admin
router.delete('/:instalacion', proteger, soloRol('admin'), async (req, res) => {
  try {
    const medidor = await Medidor.findOneAndDelete({ instalacion: req.params.instalacion })
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado' })
    res.json({ mensaje: 'Medidor eliminado correctamente' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
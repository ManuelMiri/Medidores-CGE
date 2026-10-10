// rutas/medidores.js
const express = require('express')
const router = express.Router()
const Medidor = require('../models/Medidor')
const { proteger, soloRol } = require('../middleware/auth')
const cache = require('../utils/cache')

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

// GET /api/medidores/uls
// Devuelve las ULs disponibles según el rol del usuario.
//
// Para admin/supervisor esto corre un Medidor.distinct() sobre TODA la
// colección, que es una consulta cara y cuyo resultado casi no cambia
// minuto a minuto. Por eso la guardamos en caché por 60 segundos: durante
// ese minuto, todas las peticiones se responden desde memoria en vez de
// volver a golpear la base de datos.
router.get('/uls', proteger, async (req, res) => {
  try {
    let uls

    if (req.usuario.rol === 'lector') {
      // Lector: solo sus ULs asignadas (dato que ya viene en el token/usuario,
      // no necesita consulta a la base de datos, así que no vale la pena
      // cachearlo)
      uls = req.usuario.unidadesLectura
    } else {
      const claveCache = 'uls:todas'
      const cacheado = cache.obtener(claveCache)

      if (cacheado) {
        return res.json({ uls: cacheado })
      }

      uls = await Medidor.distinct('unidadDeLectura')
      uls = uls.filter(Boolean).sort()

      cache.guardar(claveCache, uls, 60)
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
      'estado', 'observaciones', 'ubicacion',
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

// ---------------------------------------------------------------------------
// Marca permanente: "acá ya no hay medidor" (ver models/Medidor.js)
//
// Son rutas propias y no campos de `camposPermitidos` porque el permiso NO es
// el mismo para proponer que para confirmar: el lector reporta desde terreno,
// pero quien decide que un punto queda descartado para los próximos meses es
// un admin o un supervisor.
// ---------------------------------------------------------------------------

const TIPOS_DE_MARCA = ['sitioEriazo', 'noEncontrado', 'sinEmpalme']

// Un lector solo puede tocar medidores de sus propias ULs. Mismo criterio que
// el PATCH de más arriba.
function filtroPorRol(req) {
  const filtro = { instalacion: req.params.instalacion }
  if (req.usuario.rol === 'lector') {
    filtro.unidadDeLectura = { $in: req.usuario.unidadesLectura }
  }
  return filtro
}

async function aplicar(req, res, cambios, accion) {
  const medidor = await Medidor.findOneAndUpdate(
    filtroPorRol(req),
    {
      ...cambios,
      $push: {
        historial: {
          usuario: req.usuario._id,
          nombre: req.usuario.nombre,
          accion,
          fecha: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  )
  if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })
  res.json(medidor)
}

// POST /api/medidores/:instalacion/marca — proponer
//
// Idempotente a propósito: la app la llama al leer el log de TOES y el mismo
// servicio puede aparecer en varias vueltas del sondeo. Si ya hay una marca
// confirmada no se toca — una propuesta nueva no puede degradar una decisión
// que ya tomó un supervisor.
router.post('/:instalacion/marca', proteger, async (req, res) => {
  try {
    const { tipo, claveToes = null, cicloOrigen = null } = req.body ?? {}
    if (!TIPOS_DE_MARCA.includes(tipo)) {
      return res.status(400).json({ error: `tipo debe ser uno de: ${TIPOS_DE_MARCA.join(', ')}` })
    }

    const existente = await Medidor.findOne(filtroPorRol(req)).select('marcaPermanente')
    if (!existente) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })
    if (existente.marcaPermanente) {
      const m = existente.marcaPermanente
      if (m.situacion === 'confirmada' || m.tipo === tipo) return res.json(existente)
    }

    await aplicar(
      req,
      res,
      {
        $set: {
          marcaPermanente: {
            tipo,
            situacion: 'propuesta',
            claveToes,
            cicloOrigen,
            propuestaPor: req.usuario._id,
            fechaPropuesta: new Date(),
          },
        },
      },
      `marca propuesta → ${tipo}${claveToes ? ` (clave ${claveToes})` : ''}`
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/medidores/:instalacion/marca — confirmar. Solo admin/supervisor.
//
// Al confirmar se pone también estado: 'perdido', que es lo que ese valor
// significa: el medidor ya no está en terreno. El motivo preciso queda en la
// marca, que es lo que el mapa pinta.
router.patch('/:instalacion/marca', proteger, soloRol('admin', 'supervisor'), async (req, res) => {
  try {
    // req.body?. y no req.body.: en Express 5, una peticion sin cuerpo deja
    // req.body en undefined y esto reventaba con un 500 en vez del 409.
    const situacion = req.body?.situacion ?? 'confirmada'
    if (!['confirmada', 'rechazada'].includes(situacion)) {
      return res.status(400).json({ error: "situacion debe ser 'confirmada' o 'rechazada'" })
    }

    const medidor = await Medidor.findOne(filtroPorRol(req)).select('marcaPermanente')
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })
    if (!medidor.marcaPermanente) {
      return res.status(409).json({ error: 'Este medidor no tiene ninguna marca que resolver' })
    }

    const cambios = {
      'marcaPermanente.situacion': situacion,
      'marcaPermanente.confirmadaPor': req.usuario._id,
      'marcaPermanente.fechaConfirmacion': new Date(),
    }
    // Solo confirmar descarta el punto. Rechazar deja constancia de la
    // decisión pero no toca el estado del medidor.
    if (situacion === 'confirmada') cambios.estado = 'perdido'

    await aplicar(
      req,
      res,
      { $set: cambios },
      `marca ${situacion} → ${medidor.marcaPermanente.tipo}`
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/medidores/:instalacion/marca — quitar
//
// Abierto a cualquier rol a propósito: es el lado seguro del error. La app lo
// llama sola cuando TOES registra una lectura real en un punto marcado, porque
// esa lectura prueba que el medidor sí está. Como mucho, alguien vuelve a
// buscar un medidor; lo caro es lo contrario, dejar uno real descartado.
//
// No toca `estado`: si un supervisor lo dejó en 'perdido' al confirmar, puede
// haber otros motivos para que siga así, y ese campo se edita a mano.
router.delete('/:instalacion/marca', proteger, async (req, res) => {
  try {
    await aplicar(req, res, { $unset: { marcaPermanente: '' } }, 'marca quitada')
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
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
    if (ul && req.usuario.rol === 'lector') {
      // Antes `?ul=` pasaba directo al filtro y un lector podía leer cualquier
      // ruta con solo nombrarla. Una ajena devuelve lista vacía y no 403: la
      // app pide todas las ULs marcadas con un Promise.all, y una UL que le
      // quitaron (pero que sigue guardada en el teléfono) tumbaría la carga
      // de las demás.
      const propias = req.usuario.unidadesLectura || []
      filtro.unidadDeLectura = { $in: propias.includes(ul) ? [ul] : [] }
    } else if (ul) {
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

// GET /api/medidores/buscar?q=102243462&ul=E3542002,E3542003
// `ul` acepta varias separadas por coma: el mapa busca solo en las ULs que el
// lector tiene marcadas. Sin eso, "Los Aromos 12" saltaba a otra ruta y la
// marcaba sola, y el lector terminaba con el mapa lleno de pines ajenos.
router.get('/buscar', proteger, async (req, res) => {
  try {
    const { q } = req.query
    if (!q) return res.status(400).json({ error: 'Parámetro q requerido' })

    // Lo que escribe el lector es texto, no una expresión: un "12 (casa)" o un
    // "s/n" no tienen que cambiar qué se busca ni tirar un 500.
    const texto = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filtro = {
      $or: [
        { instalacion:   { $regex: texto, $options: 'i' } },
        { direccion:     { $regex: texto, $options: 'i' } },
        { numeroDePoste: { $regex: texto, $options: 'i' } },
        { numeroDeSerie: { $regex: texto, $options: 'i' } },
      ],
    }

    let uls = req.query.ul
      ? String(req.query.ul).split(',').map((u) => u.trim()).filter(Boolean)
      : null
    // Un lector no puede salir de sus ULs pasándolas en la URL.
    if (req.usuario.rol === 'lector') {
      const propias = req.usuario.unidadesLectura || []
      uls = uls ? uls.filter((u) => propias.includes(u)) : propias
    }
    if (uls) filtro.unidadDeLectura = { $in: uls }

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
      const claveCache = cache.CLAVE_ULS
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

// GET /api/medidores/marcas-pendientes — admin y supervisor
// Las marcas permanentes que esperan que una persona decida (situación
// 'propuesta'), de TODAS las ULs: el modo revisión del mapa las muestra
// juntas, aunque no estén marcadas en el panel. Son los mismos roles que
// pueden confirmar (PATCH /:instalacion/marca).
//
// Va ANTES de GET /:instalacion: si no, Express tomaría "marcas-pendientes"
// como un número de instalación.
router.get('/marcas-pendientes', proteger, soloRol('admin', 'supervisor'), async (req, res) => {
  try {
    const medidores = await Medidor.find({ 'marcaPermanente.situacion': 'propuesta' })
      .sort({ unidadDeLectura: 1, instalacion: 1 })
      .select('-__v')
    res.json({ medidores })
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
    // Puede ser la primera de una UL nueva.
    cache.invalidarUls()

    res.status(201).json(medidor)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/medidores/desde-toes
// Body: { instalacion, ul, lat, lng, serie?, marca?, direccion?, poste?, ciclo?, fecha? }
//
// Crea el pin de un servicio que se tomó en TOES y no estaba en el mapa. La
// app lo llama sola (hooks/useEnviosToes.js). Es la tercera excepción a "el
// log no sale del teléfono", pedida por el usuario: viaja la instalación, la
// UL, el ciclo, la serie y la marca del medidor, la dirección y el poste (los
// mismos que entrega MLA en los mapas de ruta) y el GPS del lector al guardar.
// Nunca la lectura ni el nombre del cliente.
//
// Si la instalación ya existe —en esta UL o en otra— no se toca nada: puede
// ser un servicio mal enrutado, y eso lo decide una persona, no el sondeo.
// La única excepción es un pin que creó esta misma ruta antes de que el log
// diera dirección y poste: a ese se le completan, solo si están vacíos.
router.post('/desde-toes', proteger, async (req, res) => {
  try {
    const texto = (v, max = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)
    const instalacion = texto(req.body?.instalacion)
    const ul = texto(req.body?.ul)
    const lat = Number(req.body?.lat)
    const lng = Number(req.body?.lng)
    const direccion = texto(req.body?.direccion, 200)
    const poste = texto(req.body?.poste)
    if (!instalacion || !ul) return res.status(400).json({ error: 'instalacion y ul son obligatorias' })
    // Chile continental: un GPS sin señal (0,0) o cualquier otra cosa no crea un pin.
    if (!(lat >= -56 && lat <= -17 && lng >= -76 && lng <= -66)) {
      return res.status(400).json({ error: 'Coordenadas fuera de rango' })
    }
    if (req.usuario.rol === 'lector' && !(req.usuario.unidadesLectura || []).includes(ul)) {
      return res.status(403).json({ error: 'No tienes acceso a esa UL' })
    }

    const existente = await Medidor.findOne({ instalacion })
      .select('instalacion unidadDeLectura desdeToes direccion numeroDePoste')
    if (existente) {
      const completar = {}
      if (existente.desdeToes) {
        if (!existente.direccion && direccion) completar.direccion = direccion
        if (!existente.numeroDePoste && poste) completar.numeroDePoste = poste
      }
      if (Object.keys(completar).length === 0) {
        return res.status(200).json({ creado: false, unidadDeLectura: existente.unidadDeLectura })
      }
      await Medidor.updateOne({ _id: existente._id }, {
        $set: completar,
        $push: {
          historial: {
            usuario: req.usuario._id,
            nombre: req.usuario.nombre,
            accion: `completado desde TOES: ${Object.keys(completar).join(' y ')}`,
            fecha: new Date(),
          },
        },
      })
      return res.status(200).json({ creado: false, completado: true })
    }

    const fechaLectura = new Date(req.body?.fecha)
    const ciclo = texto(req.body?.ciclo)
    let medidor
    try {
      medidor = await Medidor.create({
        instalacion,
        unidadDeLectura: ul,
        numeroDeSerie: texto(req.body?.serie),
        marca: texto(req.body?.marca),
        direccion,
        numeroDePoste: poste,
        ubicacion: { type: 'Point', coordinates: [lng, lat] },
        estado: 'pendiente',
        desdeToes: {
          ciclo,
          fechaLectura: Number.isNaN(fechaLectura.getTime()) ? null : fechaLectura,
        },
        historial: [{
          usuario: req.usuario._id,
          nombre: req.usuario.nombre,
          accion: `creado desde TOES (GPS del lector al guardar${ciclo ? `, ciclo ${ciclo}` : ''})`,
          fecha: new Date(),
        }],
      })
    } catch (err) {
      // Dos teléfonos (o dos vueltas del sondeo) llegaron a la vez: ya existe.
      if (err?.code === 11000) return res.status(200).json({ creado: false })
      throw err
    }
    cache.invalidarUls()

    res.status(201).json({ creado: true, medidor })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/medidores/:instalacion
// Actualizar medidor — registra auditoría
router.patch('/:instalacion', proteger, async (req, res) => {
  try {
    // 'ubicacion' ya no va acá: mover un punto tiene su propia ruta
    // (PATCH /:instalacion/ubicacion), solo para admin y supervisor y con la
    // posición anterior en el historial. Ningún cliente la mandaba por este
    // camino, así que un APK viejo no nota la diferencia.
    const camposPermitidos = [
      'estado', 'observaciones',
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

// POST /api/medidores/:instalacion/cambio-medidor
// Body: { serie, marca, serieAnterior?, ciclo?, fecha? }
//
// La app lo llama sola cuando el log de TOES trae un bloque /CambioMedidor.
// Es la segunda excepción a "el log no sale del teléfono", aprobada por el
// usuario: viaja solo la serie y la marca del medidor (nuevo y anterior), el
// ciclo y la fecha. Nunca la lectura del medidor nuevo, que también viene en
// el bloque.
//
// Abierto a cualquier rol con acceso a la UL: es el lector el que cambia el
// medidor en terreno, y lo que hace es dejar la base igual que SAP.
//
// Idempotente: el sondeo puede mandar el mismo cambio varias veces.
router.post('/:instalacion/cambio-medidor', proteger, async (req, res) => {
  try {
    const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : null)
    const serie = texto(req.body?.serie)
    const marca = texto(req.body?.marca)
    const serieAnterior = texto(req.body?.serieAnterior)
    const ciclo = texto(req.body?.ciclo)
    if (!serie) return res.status(400).json({ error: 'serie es obligatoria' })
    const fechaPedida = new Date(req.body?.fecha)
    const fecha = Number.isNaN(fechaPedida.getTime()) ? new Date() : fechaPedida

    const medidor = await Medidor.findOne(filtroPorRol(req))
    if (!medidor) return res.status(404).json({ error: 'Medidor no encontrado o sin acceso' })

    const yaEsta = medidor.numeroDeSerie === serie ||
      medidor.medidorLupa?.numeroDeSerie === serie ||
      medidor.cambioMedidor?.serieNueva === serie
    if (yaEsta) return res.json(medidor)

    // TOES no dice cuál de los dos se cambió; lo dice la serie vieja que
    // traía la orden. Si era la del lupa, se cambia el lupa.
    const esLupa = Boolean(serieAnterior) && medidor.medidorLupa?.numeroDeSerie === serieAnterior
    const antes = esLupa ? medidor.medidorLupa : medidor
    const cambio = {
      cual: esLupa ? 'lupa' : 'principal',
      serieAnterior: antes.numeroDeSerie ?? serieAnterior,
      marcaAnterior: antes.marca ?? null,
      serieNueva: serie,
      marcaNueva: marca,
      ciclo,
      fecha,
      registradoPor: req.usuario._id,
    }
    const $set = { cambioMedidor: cambio }
    if (esLupa) {
      $set['medidorLupa.numeroDeSerie'] = serie
      $set['medidorLupa.marca'] = marca
    } else {
      $set.numeroDeSerie = serie
      $set.marca = marca
    }

    await aplicar(
      req,
      res,
      { $set },
      `cambio de medidor${esLupa ? ' lupa' : ''} (TOES${ciclo ? `, ciclo ${ciclo}` : ''}): ` +
        `${cambio.serieAnterior ?? '—'}${cambio.marcaAnterior ? ` (${cambio.marcaAnterior})` : ''} → ` +
        `${serie}${marca ? ` (${marca})` : ''}`
    )
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

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

// PATCH /api/medidores/:instalacion/ubicacion — mover el pin
// Caso real: una ruta importada traía servicios en una posición que no era la
// suya, y la única forma de corregirlos era borrar el punto y crearlo de
// nuevo, perdiendo su historial y sus fotos. Mover es de admin o supervisor
// porque una ubicación mal puesta manda al próximo lector al lugar
// equivocado. La posición anterior queda escrita en el historial: así nunca
// se pierde de dónde venía el punto y se puede deshacer a mano.
router.patch('/:instalacion/ubicacion', proteger, soloRol('admin', 'supervisor'), async (req, res) => {
  try {
    const lat = Number(req.body.lat)
    const lng = Number(req.body.lng)
    // Number() y no parseFloat: "12abc" tiene que ser un error, no 12.
    const valida = req.body.lat !== null && req.body.lng !== null &&
      req.body.lat !== '' && req.body.lng !== '' &&
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    if (!valida) {
      return res.status(400).json({ error: 'La nueva ubicación necesita lat y lng válidas' })
    }

    const actual = await Medidor.findOne({ instalacion: req.params.instalacion }).select('ubicacion')
    if (!actual) return res.status(404).json({ error: 'Medidor no encontrado' })

    const fmt = (la, ln) => `${la.toFixed(6)}, ${ln.toFixed(6)}`
    const antes = actual.ubicacion?.coordinates
    const desde = antes ? fmt(antes[1], antes[0]) : 'sin ubicación'

    const medidor = await Medidor.findOneAndUpdate(
      { instalacion: req.params.instalacion },
      {
        $set: { ubicacion: { type: 'Point', coordinates: [lng, lat] } },
        $push: {
          historial: {
            usuario: req.usuario._id,
            nombre: req.usuario.nombre,
            accion: `ubicación movida de ${desde} a ${fmt(lat, lng)}`,
            fecha: new Date(),
          },
        },
      },
      { new: true, runValidators: true }
    )
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
    // Puede haber sido el último de su UL.
    cache.invalidarUls()
    res.json({ mensaje: 'Medidor eliminado correctamente' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
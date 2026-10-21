// rutas/rutas.js
// Operaciones a nivel de "ruta" (una UL completa), no de un medidor
// individual: eliminarla entera, o exportarla de vuelta al mismo formato
// Excel que usa SAP (por si hay que re-subirla allá con datos actualizados).
const express = require('express')
const router = express.Router()
const XLSX = require('xlsx')
const { proteger, soloRol } = require('../middleware/auth')
const Medidor = require('../models/Medidor')
const Usuario = require('../models/Usuario')
const NotaUl = require('../models/NotaUl')
const cache = require('../utils/cache')

// Mismo orden de columnas que trae el Excel real de SAP. Los campos que
// no guardamos en el modelo (CONTRATISTA, FECHA PLANIFICADA, TARIFA, TIPO
// DE NUMERADOR, USUARIO, SECUENCIA, SECUENCIA REAL, RFP) quedan en blanco
// — decidimos no guardarlos al importar, así que no hay de dónde sacarlos.
const COLUMNAS_SAP = [
  'ZONA', 'ESTABLECIMIENTO', 'PROCESO', 'CONTRATISTA', 'INSTALACION',
  'FECHA PLANIFICADA', 'TARIFA', 'UNIDAD DE LECTURA', 'DIRECCION',
  'NUMERO DE POSTE', 'NUMERO DE SERIE', 'MARCA', 'TIPO DE NUMERADOR',
  'USUARIO', 'SECUENCIA', 'SECUENCIA REAL', 'COORDENADAS', 'RFP',
]

function medidorAFilaSap(medidor) {
  // El Excel de SAP trae las coordenadas como "lat, lng" en un solo
  // string — invierto de vuelta el [lng, lat] que guardamos internamente.
  const coords = medidor.ubicacion?.coordinates
  const coordenadas = coords ? `${coords[1]}, ${coords[0]}` : ''

  return {
    ZONA: medidor.zona || '',
    ESTABLECIMIENTO: medidor.establecimiento || '',
    PROCESO: medidor.proceso ?? '',
    CONTRATISTA: '',
    INSTALACION: medidor.instalacion || '',
    'FECHA PLANIFICADA': '',
    TARIFA: '',
    'UNIDAD DE LECTURA': medidor.unidadDeLectura || '',
    DIRECCION: medidor.direccion || '',
    'NUMERO DE POSTE': medidor.numeroDePoste || '',
    'NUMERO DE SERIE': medidor.numeroDeSerie || '',
    MARCA: medidor.marca || '',
    'TIPO DE NUMERADOR': '',
    USUARIO: '',
    SECUENCIA: '',
    'SECUENCIA REAL': '',
    COORDENADAS: coordenadas,
    RFP: '',
  }
}

// El texto que deja rutas/importacion.js en el historial de cada medidor que
// crea. Si cambia allá, cambia acá: el test de /subidas importa por la ruta
// real, así que una diferencia no pasa callada.
const ACCION_IMPORTACION = 'Creado por importación de ruta'

// GET /api/rutas/subidas?ul=A,B — solo admin
// Quién subió (importó) cada ruta. No hay un registro aparte de importaciones:
// sale del historial de los medidores, que guarda el nombre de quien confirmó.
// Si la UL se subió en partes, cuenta la primera subida y `otros` dice cuántas
// personas más le agregaron medidores. Una UL sin medidores importados (todos
// creados a mano o desde TOES) no aparece.
router.get('/subidas', proteger, soloRol('admin'), async (req, res) => {
  try {
    const uls = String(req.query.ul ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const filtro = { 'historial.accion': ACCION_IMPORTACION }
    if (uls.length) filtro.unidadDeLectura = { $in: uls }

    const filas = await Medidor.aggregate([
      { $match: filtro },
      { $unwind: '$historial' },
      { $match: { 'historial.accion': ACCION_IMPORTACION } },
      {
        $group: {
          _id: { ul: '$unidadDeLectura', usuario: '$historial.usuario' },
          nombre: { $first: '$historial.nombre' },
          fecha: { $min: '$historial.fecha' },
          medidores: { $sum: 1 },
        },
      },
      { $sort: { fecha: 1 } },
    ])

    // El nombre se guarda en el historial desde siempre, pero por si falta,
    // se busca en la cuenta.
    const sinNombre = filas.filter((f) => !f.nombre && f._id.usuario).map((f) => f._id.usuario)
    const nombres = new Map()
    if (sinNombre.length) {
      for (const u of await Usuario.find({ _id: { $in: sinNombre } }).select('nombre')) {
        nombres.set(String(u._id), u.nombre)
      }
    }

    const porUl = new Map()
    for (const f of filas) {
      const previa = porUl.get(f._id.ul)
      if (previa) {
        previa.otros++
        continue
      }
      porUl.set(f._id.ul, {
        ul: f._id.ul,
        nombre: f.nombre || nombres.get(String(f._id.usuario)) || null,
        fecha: f.fecha,
        medidores: f.medidores,
        otros: 0,
      })
    }
    res.json({ subidas: [...porUl.values()] })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/rutas/:ul/exportar — admin y supervisor
// Descarga todos los medidores de esa UL en un .xlsx con las mismas
// columnas que usa SAP.
router.get('/:ul/exportar', proteger, soloRol('admin', 'supervisor'), async (req, res) => {
  try {
    const medidores = await Medidor.find({ unidadDeLectura: req.params.ul })
    if (medidores.length === 0) {
      return res.status(404).json({ error: 'No hay medidores registrados en esa UL' })
    }

    const filas = medidores.map(medidorAFilaSap)
    const hoja = XLSX.utils.json_to_sheet(filas, { header: COLUMNAS_SAP })
    const libro = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(libro, hoja, 'Exportación SAPUI5')
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.ul}.xlsx"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/rutas/:ul — solo admin
// Elimina TODOS los medidores de esa UL de una sola vez. También limpia
// esa UL de la lista de cualquier lector que la tuviera asignada, para no
// dejar referencias colgando a una ruta que ya no existe.
router.delete('/:ul', proteger, soloRol('admin'), async (req, res) => {
  try {
    const resultado = await Medidor.deleteMany({ unidadDeLectura: req.params.ul })

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ error: 'No hay medidores registrados en esa UL' })
    }

    cache.invalidarUls()

    await Usuario.updateMany(
      { unidadesLectura: req.params.ul },
      { $pull: { unidadesLectura: req.params.ul } }
    )

    res.json({ mensaje: 'Ruta eliminada correctamente', totalEliminados: resultado.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Notas de la ruta (ver models/NotaUl.js)
//
// Las ve y las escribe cualquiera que tenga la UL: el dato lo sabe el que
// estuvo en terreno, que casi siempre es un lector. Editar u ocultar es del
// autor o de un admin/supervisor. No hay DELETE: nada se borra.
// ---------------------------------------------------------------------------

function tieneLaUl(req) {
  return req.usuario.rol !== 'lector' ||
    (req.usuario.unidadesLectura || []).includes(req.params.ul)
}

const textoDeNota = (v) => (typeof v === 'string' ? v.trim() : '')

// GET /api/rutas/:ul/notas — las visibles, las más nuevas primero
router.get('/:ul/notas', proteger, async (req, res) => {
  try {
    if (!tieneLaUl(req)) return res.status(403).json({ error: 'No tienes acceso a esa UL' })
    const notas = await NotaUl.find({ ul: req.params.ul, visible: true })
      .sort({ createdAt: -1 })
      .select('-ediciones -__v')
    res.json({ notas })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/rutas/:ul/notas — body: { texto }
router.post('/:ul/notas', proteger, async (req, res) => {
  try {
    if (!tieneLaUl(req)) return res.status(403).json({ error: 'No tienes acceso a esa UL' })
    const texto = textoDeNota(req.body?.texto)
    if (!texto) return res.status(400).json({ error: 'La nota no puede ir vacía' })
    if (texto.length > 1000) return res.status(400).json({ error: 'La nota es muy larga (máximo 1000 caracteres)' })

    const nota = await NotaUl.create({
      ul: req.params.ul,
      texto,
      autor: req.usuario._id,
      autorNombre: req.usuario.nombre,
    })
    res.status(201).json(nota)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rutas/:ul/notas/:id — body: { texto?, visible? }
// Ocultar es `visible: false`; la nota sigue en la base.
router.patch('/:ul/notas/:id', proteger, async (req, res) => {
  try {
    if (!tieneLaUl(req)) return res.status(403).json({ error: 'No tienes acceso a esa UL' })
    const nota = await NotaUl.findOne({ _id: req.params.id, ul: req.params.ul }).catch(() => null)
    if (!nota) return res.status(404).json({ error: 'Nota no encontrada' })

    const decide = req.usuario.rol === 'admin' || req.usuario.rol === 'supervisor'
    if (!decide && String(nota.autor) !== String(req.usuario._id)) {
      return res.status(403).json({ error: 'Solo el autor o un supervisor puede cambiar esta nota' })
    }

    if (req.body?.texto !== undefined) {
      const texto = textoDeNota(req.body.texto)
      if (!texto) return res.status(400).json({ error: 'La nota no puede ir vacía; para sacarla, ocúltala' })
      if (texto.length > 1000) return res.status(400).json({ error: 'La nota es muy larga (máximo 1000 caracteres)' })
      if (texto !== nota.texto) {
        nota.ediciones.push({ texto: nota.texto, usuario: req.usuario._id, nombre: req.usuario.nombre })
        nota.texto = texto
      }
    }
    if (typeof req.body?.visible === 'boolean') nota.visible = req.body.visible

    await nota.save()
    res.json(nota)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
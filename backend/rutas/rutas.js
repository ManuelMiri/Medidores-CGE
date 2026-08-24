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

    await Usuario.updateMany(
      { unidadesLectura: req.params.ul },
      { $pull: { unidadesLectura: req.params.ul } }
    )

    res.json({ mensaje: 'Ruta eliminada correctamente', totalEliminados: resultado.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
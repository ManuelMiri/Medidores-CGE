// utils/excelSap.js
// Convierte el Excel que la analista descarga de SAP en la misma lista de
// medidores que produce kml.js — incluso comparten el mapeo de campos
// (ver mapeoMedidor.js), porque las columnas del Excel y las del
// ExtendedData del KML resultaron ser casi idénticas.
const XLSX = require('xlsx')
const { mapearCamposAMedidor } = require('./mapeoMedidor')

// SAP guarda las coordenadas como un solo string "lat, lng" (a diferencia
// del KML, que las trae como [lon, lat]). Hay que invertir el orden acá.
function parsearCoordenadas(texto) {
  if (!texto) return undefined
  const partes = String(texto).split(',').map((p) => parseFloat(p.trim()))
  if (partes.length !== 2 || partes.some(Number.isNaN)) return undefined

  const [lat, lng] = partes
  return [lng, lat]
}

// Recibe el buffer del archivo .xlsx y devuelve la misma lista de
// medidores que parsearKml(), lista para el resto del flujo de
// preview/confirmar en rutas/importacion.js.
function parsearExcelSap(buffer) {
  const libro = XLSX.read(buffer, { type: 'buffer' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' })

  return filas
    .map((fila) => mapearCamposAMedidor(
      fila['INSTALACION'],
      fila,
      parsearCoordenadas(fila['COORDENADAS'])
    ))
    .filter((medidor) => medidor.instalacion) // descarto filas sin número de instalación
}

module.exports = { parsearExcelSap }
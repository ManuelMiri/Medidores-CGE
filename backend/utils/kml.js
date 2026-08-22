// utils/kml.js
// Convierto un archivo KML (el que se descarga desde Google My Maps) en una
// lista simple de medidores. Cada <Placemark> del KML es un medidor, con sus
// datos guardados como texto plano en ExtendedData (ZONA, DIRECCION, etc.)
// y su ubicación en <Point><coordinates>.
const { DOMParser } = require('@xmldom/xmldom')
const togeojson = require('@tmcw/togeojson')
const { mapearCamposAMedidor } = require('./mapeoMedidor')

function featureAMedidor(feature) {
  const props = feature.properties || {}
  const coords = feature.geometry?.coordinates // [longitud, latitud, elevación?]

  return mapearCamposAMedidor(
    props.name,
    props,
    coords ? [coords[0], coords[1]] : undefined // descarto la elevación
  )
}

// Recibe el texto crudo del archivo KML (string XML) y devuelve un array
// de medidores listos para comparar/guardar. Si el archivo no trae ningún
// Placemark válido, devuelve un array vacío en vez de reventar.
function parsearKml(kmlTexto) {
  const dom = new DOMParser().parseFromString(kmlTexto, 'text/xml')
  const geojson = togeojson.kml(dom)

  return geojson.features
    .map(featureAMedidor)
    .filter((medidor) => medidor.instalacion) // descarto placemarks sin nombre/instalación
}

module.exports = { parsearKml, featureAMedidor }
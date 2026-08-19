// utils/kml.js
// Convierto un archivo KML (el que se descarga desde Google My Maps) en una
// lista simple de medidores. Cada <Placemark> del KML es un medidor, con sus
// datos guardados como texto plano en ExtendedData (ZONA, DIRECCION, etc.)
// y su ubicación en <Point><coordinates>.
const { DOMParser } = require('@xmldom/xmldom')
const togeojson = require('@tmcw/togeojson')

// Solo mapeo los campos que ya existen en el modelo Medidor. El KML trae
// más datos (contratista, fecha planificada, tarifa, tipo de numerador,
// usuario asignado) que por ahora decidimos no guardar.
function featureAMedidor(feature) {
  const props = feature.properties || {}
  const coords = feature.geometry?.coordinates

  // El proceso viene como texto ("59.0"), lo paso a número si se puede.
  const procesoTexto = props['PROCESO']
  const proceso = procesoTexto !== undefined && procesoTexto !== ''
    ? Number(procesoTexto)
    : null

  return {
    instalacion: props.name?.trim(),
    zona: props['ZONA']?.trim() || null,
    establecimiento: props['ESTABLECIMIENTO']?.trim() || null,
    proceso: Number.isNaN(proceso) ? null : proceso,
    unidadDeLectura: props['UNIDAD DE LECTURA']?.trim() || null,
    direccion: props['DIRECCION']?.trim() || null,
    numeroDePoste: props['NUMERO DE POSTE']?.trim() || null,
    numeroDeSerie: props['NUMERO DE SERIE']?.trim() || null,
    marca: props['MARCA']?.trim() || null,
    ubicacion: coords
      ? { type: 'Point', coordinates: [coords[0], coords[1]] } // [lon, lat], sin la elevación
      : undefined,
  }
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
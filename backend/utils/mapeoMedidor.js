// utils/mapeoMedidor.js
// El KML de Google My Maps y el Excel que baja la analista desde SAP traen
// prácticamente las mismas columnas (ZONA, ESTABLECIMIENTO, PROCESO,
// UNIDAD DE LECTURA, DIRECCION, etc.), solo que en formatos de archivo
// distintos. Este mapeo es el que ambos parsers (kml.js y excelSap.js)
// usan al final, así no repito la misma lógica de "qué campo va a dónde"
// en dos lugares.
function mapearCamposAMedidor(instalacion, props, coordenadas) {
  const procesoTexto = props['PROCESO']
  const proceso = procesoTexto !== undefined && procesoTexto !== null && procesoTexto !== ''
    ? Number(procesoTexto)
    : null

  return {
    instalacion: String(instalacion || '').trim(),
    zona: limpiar(props['ZONA']),
    establecimiento: limpiar(props['ESTABLECIMIENTO']),
    proceso: Number.isNaN(proceso) ? null : proceso,
    unidadDeLectura: limpiar(props['UNIDAD DE LECTURA']),
    direccion: limpiar(props['DIRECCION']),
    numeroDePoste: limpiar(props['NUMERO DE POSTE']),
    numeroDeSerie: limpiar(props['NUMERO DE SERIE']),
    marca: limpiar(props['MARCA']),
    ubicacion: coordenadas
      ? { type: 'Point', coordinates: coordenadas } // siempre [longitud, latitud]
      : undefined,
  }
}

function limpiar(valor) {
  if (valor === undefined || valor === null) return null
  const texto = String(valor).trim()
  return texto === '' ? null : texto
}

module.exports = { mapearCamposAMedidor }
// capasMapa.js
// Las URLs de los tiles, en un solo lugar.
//
// Viven acá y no sueltas en Mapa.jsx porque ahora las usan dos cosas: el mapa,
// que las pide a medida que te mueves, y la precarga de una ruta, que las pide
// todas de golpe con wifi. Si cada una tuviera su copia, cambiar una capa
// dejaría la precarga bajando la capa vieja — y eso no se vería como un error,
// se vería como "descargué la ruta y el mapa igual aparece vacío en terreno",
// que es de los bugs más caros de encontrar.
//
// El PORQUÉ de cada capa (de dónde sale la foto, hasta qué zoom hay, por qué
// el respaldo se monta tarde) sigue en Mapa.jsx, al lado de su TileLayer.

/** OSM directo: no pide API key, a diferencia de CARTO, que un día empezó a
 *  devolver "API KEY REQUIRED" y dejó el mapa inservible. */
export const URL_CALLES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** La foto satelital buena. blankTile=false hace que Esri devuelva error donde
 *  no tiene foto, en vez del cuadro gris. */
export const URL_FOTO = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?blankTile=false'

/** La misma foto, pero solo hasta z15 y sin blankTile: es el respaldo para los
 *  sectores donde la buena no llega. */
export const URL_FOTO_RESPALDO = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/** Caminos y sus nombres sobre la foto: sin esto, en lo rural no se ubica uno. */
export const URL_CAMINOS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

/**
 * Qué URLs hay que bajar para poder usar una capa sin red.
 *
 * El respaldo z15 queda fuera a propósito: precargando la foto buena desde z13
 * ya se bajan esos mismos niveles, y el respaldo solo se monta si la buena
 * falla — con la ruta descargada, no debería.
 */
export function urlsDeCapa(capa) {
  return capa === 'satelite' ? [URL_FOTO, URL_CAMINOS] : [URL_CALLES]
}

/** Nombre para mostrarle al lector antes de bajar. */
export function nombreDeCapa(capa) {
  return capa === 'satelite' ? 'satélite' : 'calles'
}

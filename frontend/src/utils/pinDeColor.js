// pinDeColor.js
// El pin de un color arbitrario, como imagen, para el motor sobre GPU.
//
// En Leaflet esto es un divIcon con un SVG adentro (utils/vistaMarcador.js,
// `iconoColor`): el navegador lo pinta y el color sale del atributo `fill`. En
// MapLibre los pines son sprites subidos a la GPU con `addImage`, así que un
// color nuevo es una IMAGEN nueva — no se puede teñir un PNG ya cargado.
//
// Teñir tampoco sería suficiente aunque se pudiera: MapLibre sabe teñir
// imágenes SDF, pero un SDF es de un solo color y este pin tiene tres cosas
// (la gota de color, su borde blanco y el círculo blanco del medio). Con un
// SDF se perderían las dos últimas.
//
// Por eso se dibuja a mano en un canvas, con EXACTAMENTE la misma geometría que
// el SVG de `iconoColor`: mismo path de la gota, mismo borde de 1,5 y mismo
// círculo de 4,5 al 90 % de opacidad. Si alguno de los dos cambia, el mismo
// punto se vería distinto según el motor.

/** El contorno de la gota, idéntico al `d` del SVG de iconoColor. */
const GOTA = 'M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z'

const ANCHO = 25
const ALTO = 41

/**
 * Devuelve { data, pixelRatio } listo para `map.addImage`.
 *
 * Se dibuja al doble de resolución para que no se vea pixelado en un teléfono
 * con densidad alta — el A36 tiene devicePixelRatio 2,8 — y se declara con
 * pixelRatio 2 para que en pantalla mida los mismos 25x41 de siempre.
 */
export function pinDeColor(hex, ratio = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO * ratio
  canvas.height = ALTO * ratio

  const ctx = canvas.getContext('2d')
  // Con el escalado puesto se puede dibujar en las mismas coordenadas que usa
  // el SVG, sin multiplicar nada a mano.
  ctx.scale(ratio, ratio)

  // Path2D entiende el mismo `d` de SVG, así que el contorno no se reescribe:
  // es literalmente la misma cadena.
  const gota = new Path2D(GOTA)
  ctx.fillStyle = hex
  ctx.fill(gota)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 1.5
  ctx.stroke(gota)

  ctx.beginPath()
  ctx.arc(12.5, 12.5, 4.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.fill()

  return {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio: ratio,
  }
}

/** Nombre con el que se registra en el mapa. Sin el '#', que no es válido en
 *  una expresión de estilo. */
export const nombreDePinDeColor = (hex) => 'clave-' + String(hex).replace('#', '')

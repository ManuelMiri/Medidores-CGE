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

// ---------------------------------------------------------------- contador

// El pin con el circulito rojo y el número de medidores que hay en ese punto.
//
// Se compone DENTRO de la imagen, igual que hace `iconoConContador` en Leaflet.
// La alternativa era dibujar el número como texto de una capa `symbol`, pero
// eso obliga a servir glyphs: archivos de fuente que MapLibre pide por red. Y
// depender de un host ajeno para que el mapa se vea completo es exactamente lo
// que ya pasó con CARTO, que un día empezó a pedir API key y dejó el mapa con
// "API KEY REQUIRED" encima. Componerlo acá deja el contador sin red, y de paso
// se van dos capas del estilo.
//
// Las combinaciones son pocas: el color propio de un punto solo existe cuando
// hay UN medidor visible (ver vistaDeGrupo), así que un contador siempre va
// sobre un pin de estado o sobre el dorado del seleccionado.

// Medidas del contador, las mismas que .pin-grupo-contador en index.css.
const RADIO_CONTADOR = 13
const BORDE_CONTADOR = 2
const ROJO_CONTADOR = '#c53030'

// El contador se sale de la gota, así que la imagen compuesta es más grande que
// 25x41. Se la centra en el eje X del pin para que `icon-anchor: bottom` siga
// cayendo justo en la punta, sin tener que corregir con offsets.
const CENTRO_X = 26.5
const ANCHO_COMPUESTO = 53
const DESPLAZAMIENTO_Y = 14
const ALTO_COMPUESTO = ALTO + DESPLAZAMIENTO_Y

/**
 * Dibuja `base` (la imagen del pin, ya cargada) con el contador encima.
 * Devuelve { data, pixelRatio } listo para `map.addImage`.
 */
export function pinConContador(base, cuenta, ratio = 2) {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO_COMPUESTO * ratio
  canvas.height = ALTO_COMPUESTO * ratio

  const ctx = canvas.getContext('2d')
  ctx.scale(ratio, ratio)

  // La gota, centrada en X y empujada hacia abajo para dejarle lugar arriba al
  // contador.
  ctx.drawImage(base, CENTRO_X - ANCHO / 2, DESPLAZAMIENTO_Y, ANCHO, ALTO)

  const cx = CENTRO_X + 13.5
  const cy = DESPLAZAMIENTO_Y + 1

  ctx.beginPath()
  ctx.arc(cx, cy, RADIO_CONTADOR, 0, Math.PI * 2)
  ctx.fillStyle = ROJO_CONTADOR
  ctx.fill()
  ctx.lineWidth = BORDE_CONTADOR
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(cuenta), cx, cy + 0.5)

  return {
    data: ctx.getImageData(0, 0, canvas.width, canvas.height),
    pixelRatio: ratio,
  }
}

/** Nombre con el que se registra el pin con contador. */
export const nombreConContador = (nombreBase, cuenta) => nombreBase + '-x' + cuenta

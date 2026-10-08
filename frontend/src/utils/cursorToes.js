// cursorToes.js
// Aritmética del cursor con el que se leen los logs de TOES de a trozos.
//
// Vive aparte del hook por dos razones: es pura (se puede testear con
// `node --test`, sin WebView ni teléfono) y es la parte que se equivoca en
// silencio. Un cursor mal avanzado no lanza ningún error: simplemente deja de
// ver lecturas nuevas, y el lector vería puntos pendientes que ya tomó.
//
// EL CURSOR VA SIEMPRE EN BYTES. El parser trabaja en caracteres, el archivo
// se mide en bytes y las dos escalas no coinciden: el log real de prueba tiene
// 761.639 bytes y 761.541 caracteres — 98 de diferencia por los acentos.
// Mezclarlas desincroniza la lectura y puede partir un carácter en dos,
// rompiendo el JSON.parse del bloque siguiente. Por eso este módulo existe:
// para hacer la conversión en un solo lugar y con tests.

const codificador = new TextEncoder()

/** Marcador de los bloques que el parser procesa. Igual que en toesParser. */
export const MARCA_BLOQUE = 'Backup de la lectura ('

/** Bytes que ocupa el prefijo de `texto` hasta el carácter `hasta`. */
export function bytesDePrefijo(texto, hasta = texto.length) {
  if (hasta <= 0) return 0
  const trozo = hasta >= texto.length ? texto : texto.slice(0, hasta)
  return codificador.encode(trozo).length
}

/**
 * Desde qué byte seguir leyendo un archivo ya visto antes.
 *
 * Devuelve 0 — releer entero — en todos los casos donde el cursor guardado
 * dejó de ser confiable. Releer es inofensivo: el estado se deduplica por
 * UL + ciclo + instalación y los cierres por UL + tipo + fecha, así que perder
 * el cursor nunca es un problema de correctitud, solo de rendimiento.
 *
 * El caso `unidadOffset !== 'bytes'` cubre la migración: los teléfonos que ya
 * tenían cursores en caracteres los descartan una vez y siguen en bytes.
 */
export function cursorInicial(previo, tamano) {
  if (!previo || previo.unidadOffset !== 'bytes') return 0
  if (typeof previo.cursor !== 'number' || !Number.isFinite(previo.cursor)) return 0
  if (previo.cursor <= 0) return 0
  // El archivo se achicó: TOES lo reescribió o es otro archivo con el mismo
  // nombre. El cursor viejo apuntaría a la mitad de cualquier cosa.
  if (typeof previo.tamano === 'number' && tamano < previo.tamano) return 0
  return Math.min(previo.cursor, tamano)
}

/**
 * Cuántos bytes avanzar el cursor después de parsear un trozo.
 *
 * `consumido` es lo que el parser alcanzó a procesar, en caracteres del trozo:
 * se detiene en el último bloque JSON completo, porque el último puede estar a
 * medio escribir por TOES en este mismo momento.
 *
 * `bytesLeidos` es cuánto se consumió del archivo para armar ese trozo, y
 * `hayMas` dice si el archivo sigue más allá.
 */
export function avanceDeCursor(texto, consumido, bytesLeidos, hayMas = false) {
  // Caso normal: el parser procesó todo el trozo. No hace falta reconvertir
  // nada, el equivalente en bytes es exactamente lo que se leyó.
  if (consumido >= texto.length) return bytesLeidos
  if (consumido > 0) return bytesDePrefijo(texto, consumido)

  // consumido === 0: ningún bloque completo en este trozo.
  //
  // Si el archivo termina acá, no avanzar: lo que falta es la cola que TOES
  // todavía está escribiendo, y la próxima vuelta la vuelve a leer completa.
  // Son unos pocos KB cada 5 s.
  if (!hayMas) return 0

  // El archivo sigue más allá del trozo. Acá hay que avanzar algo o el cursor
  // se queda pegado para siempre: cada vuelta leería el mismo trozo con el
  // mismo resultado. Pero sin meterse nunca dentro de un bloque.
  const marca = texto.indexOf(MARCA_BLOQUE)
  if (marca === -1) {
    // Nada que parsear en todo el trozo: son líneas de ruido del log ("Tomando
    // foto", "RAM total", sincronizaciones). Avanzar hasta la última línea
    // completa, que es lo que permite saltarse un día entero de ruido en vez
    // de agrandar la ventana de lectura indefinidamente.
    //
    // No puede caer dentro de un bloque: el marcador va en la MISMA línea que
    // la llave que abre el JSON, antes del primer salto de línea del bloque.
    // Así que cualquier trozo que contenga un salto de línea de un bloque
    // contiene también su marcador, y entonces no estaríamos en esta rama.
    const corte = texto.lastIndexOf('\n')
    return corte === -1 ? 0 : bytesDePrefijo(texto, corte + 1)
  }
  // Hay un bloque que empieza acá y no cerró dentro del trozo. Avanzar hasta
  // justo antes de ese bloque: se progresa sin perderlo.
  const corte = texto.lastIndexOf('\n', marca)
  // corte <= 0 significa que el bloque empieza en el cursor mismo y no entró
  // en la ventana. No se puede avanzar sin perderlo, así que se devuelve 0 y
  // el llamador tiene que releer con una ventana más grande (ver
  // `topeSiguiente`). Pasa solo con un bloque más grande que la ventana; los
  // reales pesan ~2 KB contra 1 MiB de ventana inicial.
  return corte <= 0 ? 0 : bytesDePrefijo(texto, corte + 1)
}

/** Ventana inicial de lectura, en bytes. Un log de un día pesa ~760 KB. */
export const TOPE_INICIAL = 1024 * 1024

/** Techo de la ventana. Más que esto no cabe cómodo cruzando el puente al WebView. */
export const TOPE_MAXIMO = 16 * 1024 * 1024

/**
 * Ventana con la que reintentar cuando `avanceDeCursor` devolvió 0 y el
 * archivo todavía sigue: el bloque no entró completo, así que hay que pedir
 * más. Devuelve null cuando ya no se puede crecer más y hay que rendirse.
 */
export function topeSiguiente(tope) {
  if (tope >= TOPE_MAXIMO) return null
  return Math.min(tope * 4, TOPE_MAXIMO)
}

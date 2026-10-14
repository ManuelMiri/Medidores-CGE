// comprimirFoto.js
// Achica la foto en el teléfono antes de guardarla o subirla.
//
// La cámara entrega fotos de varios MB (12 MP o más). Para ver un medidor, su
// serie o el poste alcanza de sobra con 1920 px por lado: queda en unos
// cientos de KB. Eso es lo que hace posible subirla con la señal de terreno y
// guardarla en el teléfono mientras espera, sin llenarlo.

export const LADO_MAXIMO = 1920
export const CALIDAD = 0.75

/** Medidas finales manteniendo la proporción; nunca agranda. */
export function medidasDestino(ancho, alto, maximo = LADO_MAXIMO) {
  if (!(ancho > 0) || !(alto > 0)) return { ancho: 0, alto: 0 }
  const escala = Math.min(1, maximo / Math.max(ancho, alto))
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) }
}

/**
 * Devuelve un Blob JPEG achicado. Si algo falla (formato raro, navegador sin
 * soporte) devuelve el archivo original: una foto pesada es mejor que ninguna.
 */
export async function comprimirFoto(archivo, { maximo = LADO_MAXIMO, calidad = CALIDAD } = {}) {
  try {
    // from-image respeta la orientación EXIF: si no, las fotos sacadas con
    // el teléfono vertical quedarían acostadas.
    const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
    const { ancho, alto } = medidasDestino(imagen.width, imagen.height, maximo)
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto)
    imagen.close?.()
    const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', calidad))
    if (!blob || blob.size >= archivo.size) return archivo
    return blob
  } catch {
    return archivo
  }
}

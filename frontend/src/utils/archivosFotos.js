// archivosFotos.js
// La cola de fotos del APK guardada en archivos de la app, y no en el
// IndexedDB del WebView.
//
// Caso real (2026-10-21): Google le reinstala al teléfono el Android System
// WebView 155 cada vez que se usa Chrome o Maps, y con la 155 TOES no
// sincroniza, así que el lector lo baja a la versión de fábrica todos los
// días. Bajar de versión borra el IndexedDB y el localStorage de las apps que
// alcanzaron a abrirse con la nueva (la vieja no abre lo que escribió la nueva
// y lo recrea vacío). Ahí vivían las fotos que esperaban señal. Los archivos
// de la app (Directory.Data) no son del WebView: sobreviven a cualquier cambio
// de versión.
//
// Cada foto son dos archivos: <idLocal>.jpg con la imagen y <idLocal>.json con
// lo demás. El .json se escribe DESPUÉS del .jpg, así que si existe, la foto
// está completa: una escritura cortada a la mitad no deja una foto rota en la
// cola. Listar lee solo los .json; la imagen se lee al subirla o al mostrarla,
// y no cada vez que el panel cuenta cuántas esperan.
//
// Sin Capacitor adentro: el sistema de archivos llega como parámetro, para que
// los tests corran en node con uno falso.

export const CARPETA = 'colaFotos'

/** Blob → base64 sin el prefijo `data:`, que es lo que pide Filesystem.writeFile. */
export async function base64DeBlob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binario = ''
  // En trozos: String.fromCharCode con cientos de miles de argumentos revienta
  // la pila, y una foto comprimida pesa unos cientos de KB.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

export function blobDeBase64(base64, tipo = 'image/jpeg') {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

/**
 * Un almacén con la misma forma que el de IndexedDB de colaFotos.js:
 * { guardar, listar, leerImagen, quitar }.
 *
 * @param fs    con la forma de `Filesystem` de @capacitor/filesystem
 * @param dir   el `directory` (Directory.Data)
 * @param utf8  el `encoding` para texto (Encoding.UTF8)
 */
export function crearAlmacenArchivos(fs, dir, utf8) {
  const ruta = (idLocal, ext) => `${CARPETA}/${idLocal}.${ext}`

  return {
    /** Con `blob` escribe la imagen; sin él (anotar un fallo) solo los datos. */
    async guardar(foto) {
      const { blob, ...datos } = foto
      if (blob) {
        await fs.writeFile({
          path: ruta(foto.idLocal, 'jpg'), data: await base64DeBlob(blob), directory: dir, recursive: true,
        })
      }
      await fs.writeFile({
        path: ruta(foto.idLocal, 'json'), data: JSON.stringify(datos), directory: dir, encoding: utf8, recursive: true,
      })
    },

    async listar() {
      let archivos
      try {
        ({ files: archivos } = await fs.readdir({ path: CARPETA, directory: dir }))
      } catch {
        return [] // la carpeta se crea con la primera foto
      }
      const fotos = []
      for (const archivo of archivos ?? []) {
        const nombre = typeof archivo === 'string' ? archivo : archivo.name
        if (!nombre?.endsWith('.json')) continue
        try {
          const { data } = await fs.readFile({ path: `${CARPETA}/${nombre}`, directory: dir, encoding: utf8 })
          fotos.push(JSON.parse(data))
        } catch {
          // Un .json ilegible no tapa a las demás. Tampoco se borra: la imagen
          // sigue ahí y se puede rescatar a mano.
        }
      }
      return fotos
    },

    async leerImagen(foto) {
      const { data } = await fs.readFile({ path: ruta(foto.idLocal, 'jpg'), directory: dir })
      // En Android llega como base64; la implementación web del plugin puede
      // devolver un Blob.
      return typeof data === 'string' ? blobDeBase64(data) : data
    },

    async quitar(idLocal) {
      // Primero el .json: sin él la foto ya salió de la cola aunque falle lo otro.
      await fs.deleteFile({ path: ruta(idLocal, 'json'), directory: dir })
      try {
        await fs.deleteFile({ path: ruta(idLocal, 'jpg'), directory: dir })
      } catch {
        // ya no estaba
      }
    },
  }
}

/**
 * Pasa las fotos de un almacén a otro (del IndexedDB a los archivos). Cada una
 * se saca del origen recién después de escribirla en el destino: si algo falla
 * a la mitad, la foto queda en el origen o en los dos, nunca en ninguno.
 */
export async function migrarCola(origen, destino) {
  let pasadas = 0
  let quedaron = 0
  for (const foto of await origen.listar()) {
    try {
      const blob = await origen.leerImagen(foto)
      await destino.guardar({ ...foto, blob })
      await origen.quitar(foto.idLocal)
      pasadas++
    } catch {
      quedaron++
    }
  }
  return { pasadas, quedaron }
}

/** Une las listas de dos almacenes sin repetir; gana la primera. */
export function unirListas(principal, resto) {
  const vistos = new Set(principal.map((f) => f.idLocal))
  return [...principal, ...resto.filter((f) => !vistos.has(f.idLocal))]
}

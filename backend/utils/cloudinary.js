// utils/cloudinary.js
// Configuro el SDK de Cloudinary una sola vez acá, leyendo las credenciales
// desde las variables de entorno (las mismas que agregué en Railway).
// El resto del proyecto solo importa 'cloudinary' desde este archivo, así
// no hay que repetir la config en cada lugar que suba una imagen.
const cloudinary = require('cloudinary').v2

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Chequeo de arranque: si falta alguna de las 3 variables, lo dejo bien
// visible en los logs de Railway en vez de esperar a que reviente en el
// primer intento de subir una foto con un error genérico de Cloudinary.
const faltantes = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']
  .filter((clave) => !process.env[clave])
if (faltantes.length > 0) {
  console.error(`⚠️ Faltan variables de entorno de Cloudinary: ${faltantes.join(', ')}`)
} else {
  console.log('✅ Cloudinary configurado correctamente')
}

// Sube un buffer de imagen (lo que llega desde multer en memoria) a
// Cloudinary y devuelve la URL pública. Uso upload_stream porque no
// tenemos el archivo en disco, solo en memoria.
function subirImagen(buffer, carpeta = 'medidores-cge') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta },
      (error, resultado) => {
        if (error) return reject(error)
        resolve(resultado)
      }
    )
    stream.end(buffer)
  })
}

module.exports = { cloudinary, subirImagen }
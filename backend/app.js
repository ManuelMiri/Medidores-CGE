const express = require('express')
const cors = require('cors')

const app = express()

// Middlewares esenciales
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://medidores-cge.vercel.app',
    // Origen del WebView de la app Android (Capacitor con androidScheme https).
    // Sin esto el APK no pasa ni el login: el token va como header
    // Authorization, eso dispara preflight, y el preflight se rechaza.
    'https://localhost'
  ]
}))
// El límite por defecto de express.json() es 100 KB, y /importacion/confirmar
// recibe la ruta entera: ~340 bytes por medidor, así que una de ~300 cabía
// justo y una de 515 (E3509011, oct-2026) daba 413 en HTML, que la app solo
// podía mostrar como "Error al importar". 10 MB alcanza para ~30.000.
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Rutas
const rutasMedidores = require('./rutas/medidores')
app.use('/api/medidores', rutasMedidores)

const rutasFotos = require('./rutas/fotos')
app.use('/api/medidores', rutasFotos)

const rutasAuth = require('./rutas/auth')
app.use('/api/auth', rutasAuth)

const rutasImportacion = require('./rutas/importacion')
app.use('/api/importacion', rutasImportacion)

const rutasGestionRutas = require('./rutas/rutas')
app.use('/api/rutas', rutasGestionRutas)

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Medidores CGE funcionando', estado: 'ok' })
})

module.exports = app
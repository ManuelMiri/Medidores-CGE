const express = require('express')
const cors = require('cors')

const app = express()

// Middlewares esenciales
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://medidores-cge.vercel.app'
  ]
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Rutas
const rutasMedidores = require('./rutas/medidores')
app.use('/api/medidores', rutasMedidores)

const rutasAuth = require('./rutas/auth')
app.use('/api/auth', rutasAuth)

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Medidores CGE funcionando', estado: 'ok' })
})

module.exports = app
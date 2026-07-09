require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

const app = express()

// Middlewares esenciales
app.use(cors())                  // permite peticiones desde el frontend
app.use(express.json())          // parsea el body de las peticiones como JSON
app.use(express.urlencoded({ extended: true }))
const rutasMedidores = require('./rutas/medidores')
app.use('/api/medidores', rutasMedidores)
const rutasAuth = require('./rutas/auth')
app.use('/api/auth', rutasAuth)

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Medidores CGE funcionando', estado: 'ok' })
})

// Arranque: primero conectar a MongoDB, luego levantar el servidor
const PORT = process.env.PORT || 3000

async function iniciar() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Conectado a MongoDB Atlas')

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
    })
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err.message)
    process.exit(1) // si no hay DB, no tiene sentido levantar el servidor
  }
}

iniciar()
require('dotenv').config()
const mongoose = require('mongoose')
const app = require('./app')

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
    process.exit(1)
  }
}

iniciar()
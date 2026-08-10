require('dotenv').config()
const mongoose = require('mongoose')
const cluster = require('cluster')
const os = require('os')
const app = require('./app')

const PORT = process.env.PORT || 3000

async function iniciar() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Conectado a MongoDB Atlas')

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT} (PID ${process.pid})`)
    })
  } catch (err) {
    console.error('❌ Error al conectar a MongoDB:', err.message)
    process.exit(1)
  }
}

// Estrategia básica de escalabilidad: en producción, en vez de correr un
// solo proceso de Node (que solo aprovecha un núcleo de CPU), levantamos
// un proceso "worker" por cada núcleo disponible usando el módulo
// "cluster" que ya trae Node.js, sin instalar nada externo.
//
// El proceso "primario" no atiende peticiones directamente: solo reparte
// las conexiones entrantes entre los workers de forma automática
// (round-robin). En la práctica, esto es balanceo de carga a nivel de una
// sola máquina. Si un worker se cae, el primario levanta uno nuevo en su
// reemplazo, así el servicio completo no se cae por un solo proceso que falle.
//
// En desarrollo local seguimos usando un solo proceso: mezclar nodemon
// (que reinicia el proceso) con cluster (que crea varios) hace que los
// reinicios sean confusos de seguir mientras se está programando.
const usarCluster = process.env.NODE_ENV === 'production'

if (usarCluster && cluster.isPrimary) {
  const nucleos = os.cpus().length
  console.log(`🧠 Modo cluster activo: iniciando ${nucleos} proceso(s) worker`)

  for (let i = 0; i < nucleos; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker) => {
    console.log(`⚠️ Worker ${worker.process.pid} se detuvo, iniciando uno nuevo`)
    cluster.fork()
  })
} else {
  iniciar()
}
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

// Para la estrategia de escalabilidad uso el modulo cluster que ya trae
// Node.js, en vez de correr un solo proceso,
// levanto un proceso worker por nucleo, asi se reparte la carga.
//
// El proceso principal no atiende peticiones, solo reparte las conexiones
// entrantes entre los workers. Si un worker se cae, levanto uno nuevo en
// su lugar para que el servicio no se caiga completo por un solo proceso.
//
// En desarrollo dejo esto desactivado un solo proceso, porque mezclar
// nodemon con cluster hace que los reinicios sean confusos mientras programo.
const usarCluster = process.env.NODE_ENV === 'production'

if (usarCluster && cluster.isPrimary) {
  // Aca tuve un problema, usaba os.cpus().length directo para decidir
  // cuantos workers levantar, pero dentro de un contenedor como el de
  // Railway, ese numero no es confiable , devuelve los nucleos de la
  // maquina fisica completa, no los que realmente tiene asignados mi
  // contenedor. Eso hacia que levantara muchos mas workers de los que
  // la memoria disponible aguantaba y el servidor se caia y reiniciaba
  // solo de forma intermitente, lo arreglé poniendo un tope máximo.
  const nucleos = Math.min(os.cpus().length, Number(process.env.WEB_CONCURRENCY) || 2)
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
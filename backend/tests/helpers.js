// tests/helpers.js
// Antes cada archivo de test creaba usuarios pegándole al endpoint
// POST /api/auth/registro. Eso dejó de servir para armar datos de prueba
// porque ahora ese endpoint requiere ser admin (ver rutas/auth.js) — no
// se puede usar para crear el PRIMER usuario de un test.
//
// Esta función crea el usuario directo en la base (saltándose la ruta
// HTTP) y firma su token a mano, igual que lo hace auth.js. Así los tests
// arman sus datos sin depender de si el endpoint está protegido o no.
const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')

async function crearUsuarioYObtenerToken(rol, opciones = {}) {
  const email = opciones.email || `usuario_${rol}_${Date.now()}_${Math.random()}@test.com`

  const usuario = await Usuario.create({
    nombre: opciones.nombre || `Usuario ${rol}`,
    email,
    password: opciones.password || '123456',
    rol,
    zona: opciones.zona || 'MAULE',
    unidadesLectura: opciones.unidadesLectura || [],
  })

  const token = jwt.sign(
    { id: usuario._id, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )

  return { usuario, token }
}

module.exports = { crearUsuarioYObtenerToken }
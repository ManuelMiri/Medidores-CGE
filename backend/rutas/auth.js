// rutas/auth.js
const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')

// Genera un token JWT con el id y rol del usuario
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario._id, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// POST /api/auth/registro
// Crea un nuevo usuario (solo admin debería poder hacer esto en producción)
router.post('/registro', async (req, res) => {
  try {
    const { nombre, email, password, rol, zona } = req.body

    const existe = await Usuario.findOne({ email })
    if (existe) return res.status(400).json({ error: 'El email ya está registrado' })

    const usuario = await Usuario.create({ nombre, email, password, rol, zona })

    res.status(201).json({
      mensaje: 'Usuario creado correctamente',
      usuario: {
        id:     usuario._id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol,
        zona:   usuario.zona,
      },
      token: generarToken(usuario),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/auth/login
// Inicia sesión y devuelve un token JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' })
    }

    // Buscar usuario incluyendo el password (está oculto por defecto con select: false)
    const usuario = await Usuario.findOne({ email }).select('+password')
    if (!usuario) return res.status(401).json({ error: 'Credenciales incorrectas' })

    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado' })

    const passwordCorrecta = await usuario.verificarPassword(password)
    if (!passwordCorrecta) return res.status(401).json({ error: 'Credenciales incorrectas' })

    res.json({
      usuario: {
        id:     usuario._id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol,
        zona:   usuario.zona,
      },
      token: generarToken(usuario),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/auth/perfil
// Devuelve los datos del usuario autenticado (requiere token)
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const usuario = await Usuario.findById(req.usuarioId)
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(usuario)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Middleware: verifica que el token JWT sea válido
function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.usuarioId = decoded.id
    req.usuarioRol = decoded.rol
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

module.exports = router
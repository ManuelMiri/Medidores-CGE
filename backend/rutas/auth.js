// rutas/auth.js
const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')
const TokenInvalido = require('../models/TokenInvalido')

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

// POST /api/auth/logout
// Invalida el token actual para que no se pueda volver a usar, aunque su
// firma JWT siga siendo técnicamente válida hasta que expire por sí sola.
// Va protegida con verificarToken porque para cerrar una sesión primero hay
// que demostrar que tienes una sesión válida.
router.post('/logout', verificarToken, async (req, res) => {
  try {
    await TokenInvalido.create({
      token: req.token,
      expiraEn: req.tokenExpira,
    })
    res.json({ mensaje: 'Sesión cerrada correctamente' })
  } catch (err) {
    // Si el token ya estaba invalidado (doble clic en "cerrar sesión", por
    // ejemplo), el índice "unique" del modelo lanza un error de duplicado.
    // No es un error real para quien usa la app, así que igual respondemos
    // como éxito.
    if (err.code === 11000) {
      return res.json({ mensaje: 'Sesión cerrada correctamente' })
    }
    res.status(500).json({ error: err.message })
  }
})

// Middleware: verifica que el token JWT sea válido
async function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  const token = authHeader.split(' ')[1]

  try {
    // Revisamos primero si este token ya fue invalidado (el usuario cerró
    // sesión). Esta consulta va antes de jwt.verify porque es más barata:
    // no tiene sentido gastar en verificar la firma de un token que de
    // todas formas vamos a rechazar.
    const estaInvalidado = await TokenInvalido.exists({ token })
    if (estaInvalidado) {
      return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.usuarioId = decoded.id
    req.usuarioRol = decoded.rol

    // Dejamos el token y su fecha de expiración disponibles en req para que
    // la ruta de logout pueda invalidarlo sin tener que leer el header de
    // nuevo. decoded.exp viene en segundos, Date usa milisegundos.
    req.token = token
    req.tokenExpira = new Date(decoded.exp * 1000)

    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

module.exports = router
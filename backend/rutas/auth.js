// rutas/auth.js
const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')
const TokenInvalido = require('../models/TokenInvalido')
const { proteger, soloRol } = require('../middleware/auth')

// Genera un token JWT con el id y rol del usuario
function generarToken(usuario) {
  return jwt.sign(
    { id: usuario._id, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// POST /api/auth/registro
// Crea un nuevo usuario. Antes esto estaba abierto (cualquiera podía
// crearse una cuenta admin sin loguearse) — ahora solo un admin ya
// logueado puede crear cuentas nuevas.
router.post('/registro', proteger, soloRol('admin'), async (req, res) => {
  try {
    const { nombre, email, password, rol, zona, unidadesLectura } = req.body
    const existe = await Usuario.findOne({ email })
    if (existe) return res.status(400).json({ error: 'El email ya está registrado' })

    const usuario = await Usuario.create({ nombre, email, password, rol, zona, unidadesLectura })

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

    // Buscar usuario incluyendo el password, está oculto por defecto con select: false
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
// Devuelve los datos del usuario autenticado, requiere token
router.get('/perfil', proteger, async (req, res) => {
  // 'proteger' ya buscó al usuario en la base y lo dejó en req.usuario,
  // así que no hace falta otra consulta como antes.
  res.json(req.usuario)
})

// POST /api/auth/logout
// Invalida el token actual para que no se pueda volver a usar, aunque su
// firma JWT siga siendo técnicamente válida hasta que expire por sí sola.
router.post('/logout', proteger, async (req, res) => {
  try {
    await TokenInvalido.create({
      token: req.token,
      expiraEn: req.tokenExpira,
    })
    res.json({ mensaje: 'Sesión cerrada correctamente' })
  } catch (err) {
    // Si el token ya estaba invalidado, el índice "unique" del modelo lanza un error de duplicado.
    // No es un error real para quien usa la app, así que igual respondemos
    // como éxito.
    if (err.code === 11000) {
      return res.json({ mensaje: 'Sesión cerrada correctamente' })
    }
    res.status(500).json({ error: err.message })
  }
})

// GET /api/auth/usuarios — solo admin
// Lista todos los usuarios para que el admin los pueda gestionar.
router.get('/usuarios', proteger, soloRol('admin'), async (req, res) => {
  try {
    const usuarios = await Usuario.find().select('-password').sort({ nombre: 1 })
    res.json({ usuarios })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/auth/usuarios/:id/rol — solo admin
router.patch('/usuarios/:id/rol', proteger, soloRol('admin'), async (req, res) => {
  try {
    const { rol } = req.body
    const rolesValidos = ['lector', 'supervisor', 'admin']
    if (!rolesValidos.includes(rol)) {
      return res.status(400).json({ error: `Rol inválido. Debe ser uno de: ${rolesValidos.join(', ')}` })
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { rol },
      { new: true, runValidators: true }
    ).select('-password')

    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(usuario)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/auth/usuarios/:id/estado — solo admin
// Activa/desactiva una cuenta. No la borramos para no perder el rastro
// de quién hizo qué en el historial de medidores.
router.patch('/usuarios/:id/estado', proteger, soloRol('admin'), async (req, res) => {
  try {
    const { activo } = req.body
    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo activo debe ser true o false' })
    }

    // Un admin no puede desactivarse a sí mismo — evita quedarse la
    // cuenta bloqueada por accidente y sin nadie más con acceso.
    if (req.params.id === String(req.usuario._id) && activo === false) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' })
    }

    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { activo },
      { new: true, runValidators: true }
    ).select('-password')

    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(usuario)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
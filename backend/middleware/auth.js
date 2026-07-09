const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')

async function proteger(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' })
    }
    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const usuario = await Usuario.findById(decoded.id)
    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' })
    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado' })
    req.usuario = usuario
    next()
  } catch (err) {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

function soloRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}`,
      })
    }
    next()
  }
}

module.exports = { proteger, soloRol }

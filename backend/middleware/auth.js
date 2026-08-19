const jwt = require('jsonwebtoken')
const Usuario = require('../models/Usuario')
const TokenInvalido = require('../models/TokenInvalido')

async function proteger(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' })
    }
    const token = authHeader.split(' ')[1]

    // si este token ya fue invalidado (el usuario cerró sesión),
    // lo rechazamos aunque su firma JWT todavía sea válida.
    // Esta consulta va primero porque es más barata que verificar el JWT
    // y buscar el usuario en la base de datos.
    const estaInvalidado = await TokenInvalido.exists({ token })
    if (estaInvalidado) {
      return res.status(401).json({ error: 'Sesión cerrada. Vuelve a iniciar sesión.' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const usuario = await Usuario.findById(decoded.id)
    if (!usuario) return res.status(401).json({ error: 'Usuario no encontrado' })
    if (!usuario.activo) return res.status(403).json({ error: 'Usuario desactivado' })

    // Dejamos el token disponible en req para que la ruta de logout
    // pueda invalidarlo sin tener que volver a leer el header.
    req.token = token
    req.tokenExpira = new Date(decoded.exp * 1000) // decoded.exp viene en segundos, Date usa milisegundos
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
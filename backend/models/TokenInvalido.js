// models/TokenInvalido.js
const mongoose = require('mongoose')

// Guardamos el token junto con la fecha en la que de todas formas iba a
// expirar. El índice TTL le dice a MongoDB "borra este documento solo
// cuando se cumpla expiraEn", así la colección nunca acumula basura y no
// necesitamos un cron aparte para limpiarla.
const tokenInvalidoSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },
  expiraEn: {
    type: Date,
    required: true,
  },
})

// expireAfterSeconds: 0 significa "bórralo justo en la fecha de expiraEn",
// no X segundos después de esa fecha.
tokenInvalidoSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('TokenInvalido', tokenInvalidoSchema)
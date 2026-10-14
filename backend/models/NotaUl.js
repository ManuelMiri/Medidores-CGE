// models/NotaUl.js
// Información de terreno que vale para toda una ruta y no para un medidor:
// "Clave del portón del condominio Santa Isabel: 123456", "perro bravo en la
// parcela 12", "el puente se corta en invierno". El que vuelve el mes
// siguiente —que puede ser otra persona— la necesita antes de llegar.
//
// Como todo lo demás en la app, una nota nunca se borra: se oculta
// (`visible: false`), y cada edición deja el texto anterior en `ediciones`.
const mongoose = require('mongoose')

const edicionSchema = new mongoose.Schema(
  {
    texto:   { type: String, required: true },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    nombre:  { type: String },
    fecha:   { type: Date, default: Date.now },
  },
  { _id: false }
)

const notaUlSchema = new mongoose.Schema(
  {
    ul:          { type: String, required: true, trim: true, index: true },
    texto:       { type: String, required: true, trim: true, maxlength: 1000 },
    autor:       { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    autorNombre: { type: String, trim: true },
    visible:     { type: Boolean, default: true },
    ediciones:   { type: [edicionSchema], default: [] },
  },
  { timestamps: true }
)

module.exports = mongoose.model('NotaUl', notaUlSchema)

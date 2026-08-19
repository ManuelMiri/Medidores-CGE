// models/Medidor.js
const mongoose = require('mongoose')

const historialSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  nombre:  { type: String },
  accion:  { type: String },
  fecha:   { type: Date, default: Date.now },
}, { _id: false })

// Antes 'ubicacion' era un objeto plano dentro del esquema principal. El
// problema: Mongoose "auto-rellena" los objetos planos anidados con sus
// valores por defecto (el 'type: Point') incluso cuando no les pasas nada,
// dejando { type: 'Point' } sin coordinates — eso rompe el índice 2dsphere
// apenas intentas guardar un medidor sin ubicación. Al declararlo como un
// sub-schema real (con su propio 'default: undefined' más abajo), Mongoose
// sí respeta "no seteado" y el campo queda genuinamente undefined.
const ubicacionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitud, latitud]
      required: true,
    },
  },
  { _id: false }
)

const medidorSchema = new mongoose.Schema(
  {
    instalacion: {
      type: String,
      required: [true, 'El número de instalación es obligatorio'],
      unique: true,
      trim: true,
    },
    numeroDePoste:    { type: String, trim: true, default: null },
    numeroDeSerie:    { type: String, trim: true, default: null },
    marca:            { type: String, trim: true, default: null },
    zona:             { type: String, trim: true, default: null },
    establecimiento:  { type: String, trim: true, default: null },
    proceso:          { type: Number, default: null },
    unidadDeLectura:  { type: String, trim: true, default: null }, // clave de ruta (UL)
    direccion:        { type: String, trim: true, default: null },
    ubicacion: {
      type: ubicacionSchema,
      default: undefined,
    },
    estado: {
      type: String,
      enum: ['pendiente', 'localizado', 'perdido', 'revision'],
      default: 'pendiente',
    },
    fotos:             { type: [String], default: [] },
    observaciones:     { type: String, trim: true, default: null },
    localizadoPor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    fechaLocalizacion: { type: Date, default: null },

    // Auditoría — registro de cada modificación
    historial: { type: [historialSchema], default: [] },
  },
  { timestamps: true }
)

medidorSchema.index({ ubicacion: '2dsphere' })
medidorSchema.index({ unidadDeLectura: 1 })
medidorSchema.index({ instalacion: 'text', direccion: 'text', numeroDePoste: 'text' })

module.exports = mongoose.model('Medidor', medidorSchema)
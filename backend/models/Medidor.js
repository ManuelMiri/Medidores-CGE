// models/Medidor.js
const mongoose = require('mongoose')

const historialSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  nombre:  { type: String },
  accion:  { type: String },
  fecha:   { type: Date, default: Date.now },
}, { _id: false })

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
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitud, latitud]
        default: undefined,
      },
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
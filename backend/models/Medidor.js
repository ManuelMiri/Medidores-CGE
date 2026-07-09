// models/Medidor.js
const mongoose = require('mongoose')

const medidorSchema = new mongoose.Schema(
  {
    // Identificación
    instalacion: {
      type: String,
      required: [true, 'El número de instalación es obligatorio'],
      unique: true,
      trim: true,
    },
    numeroDePoste: {
      type: String,
      trim: true,
      default: null,
    },
    numeroDeSerie: {
      type: String,
      trim: true,
      default: null,
    },
    marca: {
      type: String,
      trim: true,
      default: null,
    },

    // Clasificación CGE
    zona: {
      type: String,
      trim: true,
      default: null,
    },
    establecimiento: {
      type: String,
      trim: true,
      default: null,
    },
    proceso: {
      type: Number,
      default: null,
    },
    tarifa: {
      type: String,
      trim: true,
      default: null,
    },
    unidadDeLectura: {
      type: String,
      trim: true,
      default: null,
    },
    contratista: {
      type: String,
      trim: true,
      default: null,
    },
    direccion: {
      type: String,
      trim: true,
      default: null,
    },
    fechaPlanificada: {
      type: String, // guardado como string "DD/MM/YYYY" para respetar formato chileno
      default: null,
    },

    // Geolocalización (GeoJSON Point — requerido para índice 2dsphere)
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

    // Estado del medidor
    estado: {
      type: String,
      enum: ['pendiente', 'localizado', 'perdido', 'revision'],
      default: 'pendiente',
    },

    // Fotos de evidencia (URLs de Cloudinary)
    fotos: {
      type: [String],
      default: [],
    },

    // Observaciones del lector en terreno
    observaciones: {
      type: String,
      trim: true,
      default: null,
    },

    // Quién localizó el medidor
    localizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      default: null,
    },
    fechaLocalizacion: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // agrega createdAt y updatedAt automáticamente
  }
)

// Índice 2dsphere para consultas geoespaciales ($near, $geoWithin)
medidorSchema.index({ ubicacion: '2dsphere' })

// Índice de texto para búsqueda por instalación, dirección o número de poste
medidorSchema.index({ instalacion: 'text', direccion: 'text', numeroDePoste: 'text' })

module.exports = mongoose.model('Medidor', medidorSchema)
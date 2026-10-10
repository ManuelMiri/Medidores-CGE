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

// Cada foto guarda su propia ubicación (lat/lng) y quién/cuándo la subió,
// no solo la URL de Cloudinary. Esto es distinto de 'ubicacion' del
// medidor: esa es la posición del medidor en el mapa, esta es dónde
// estaba parado el técnico cuando sacó la foto.
const fotoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    nombre: { type: String, required: true, trim: true },
    coordenadas: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    subidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
    fecha: { type: Date, default: Date.now },
  },
  { _id: false }
)

// Memoria de terreno: "acá ya no hay medidor".
//
// Es lo único del mapa que SOBREVIVE al cierre de ciclo. El problema que
// resuelve es concreto: si un lector confirma que tres puntos son sitio
// eriazo, hoy esa información se pierde al mes siguiente y el lector nuevo
// — que puede ser otra persona — vuelve a perder tiempo buscando medidores
// que ya no existen.
//
// Va aparte de `estado` a propósito. `estado` dice si ESTA app tiene el
// medidor ubicado y documentado, y solo tiene 4 valores: metiendo acá el
// motivo se perdería la diferencia entre "sitio eriazo", "se lo robaron" y
// "no tiene empalme", que en terreno no son lo mismo. Al confirmar una marca
// se pone además `estado: 'perdido'`, que es justo lo que ese valor
// significa, para que el Resumen y el color del pin queden coherentes.
//
// Dos situaciones porque el que ve el medidor y el que decide no son la
// misma persona: TOES propone (lo reportó el lector en terreno) y un admin o
// supervisor confirma. Una clave puesta por error no puede dejar un medidor
// real sin leer para siempre.
const marcaPermanenteSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['sitioEriazo', 'noEncontrado', 'sinEmpalme'],
      required: true,
    },
    // 'rechazada' no es lo mismo que borrar la marca: deja constancia de que
    // una persona miró el punto y dijo "no, acá sí hay medidor". Sin eso, el
    // sondeo volvería a proponer lo mismo a los 5 segundos, porque TOES sigue
    // teniendo esa clave en el ciclo.
    situacion: {
      type: String,
      enum: ['propuesta', 'confirmada', 'rechazada'],
      default: 'propuesta',
    },
    // Clave de TOES que la originó (26, 02…). null si se marcó a mano.
    claveToes:   { type: String, trim: true, default: null },
    // Ciclo (fecha ADATSOLL) en que TOES la reportó. Sirve para saber de
    // cuándo es el dato sin guardar nada más del log.
    cicloOrigen: { type: String, trim: true, default: null },

    propuestaPor:   { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    fechaPropuesta: { type: Date, default: Date.now },

    confirmadaPor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    fechaConfirmacion: { type: Date, default: null },
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
    // Ver el comentario de marcaPermanenteSchema. default: undefined por la
    // misma razón que `ubicacion`: un objeto plano anidado lo auto-rellenaría
    // Mongoose con sus valores por defecto aunque no se pase nada.
    marcaPermanente: {
      type: marcaPermanenteSchema,
      default: undefined,
    },
    fotos:             { type: [fotoSchema], default: [] },
    observaciones:     { type: String, trim: true, default: null },
    localizadoPor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    fechaLocalizacion: { type: Date, default: null },

    // Auditoría — registro de cada modificación
    historial: { type: [historialSchema], default: [] },
  },
  { timestamps: true }
)

medidorSchema.index({ unidadDeLectura: 1 })
// Saqué dos índices que no ocupábamos y solo hacían más lentos los inserts
// y updates (sobre todo al importar rutas con cientos de medidores):
// - el de texto (instalacion/direccion/numeroDePoste): el buscador usa $regex
// - el 2dsphere de ubicacion: solo lo usaba la ruta /cercanos, que el front
//   nunca llamaba, así que también la borré

module.exports = mongoose.model('Medidor', medidorSchema)
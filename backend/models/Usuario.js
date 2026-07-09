// models/Usuario.js
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const usuarioSchema = new mongoose.Schema(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria'],
      minlength: 6,
      select: false, // nunca se devuelve en consultas por defecto
    },
    rol: {
      type: String,
      enum: ['lector', 'supervisor', 'admin'],
      default: 'lector',
    },
    zona: {
      type: String,
      trim: true,
      default: null, // zona CGE asignada (ej: "MAULE")
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
)

// Encripta la contraseña antes de guardar
usuarioSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await bcrypt.hash(this.password, 10)
})

// Método para comparar contraseña en el login
usuarioSchema.methods.verificarPassword = async function (passwordIngresada) {
  return bcrypt.compare(passwordIngresada, this.password)
}

module.exports = mongoose.model('Usuario', usuarioSchema)
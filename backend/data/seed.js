// data/seed.js
// Importa los medidores del archivo medidores.json a MongoDB Atlas.
//
// Uso (desde la carpeta backend/):
//   node data/seed.js

require('dotenv').config()
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const Medidor = require('../models/Medidor')

async function seed() {
  try {
    console.log('Conectando a MongoDB Atlas...')
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Conectado\n')

    // Leer el archivo JSON
    const rutaArchivo = path.join(__dirname, 'medidores.json')
    const datos = JSON.parse(fs.readFileSync(rutaArchivo, 'utf8'))
    console.log(`📄 ${datos.length} medidores encontrados en el archivo`)

    // Limpiar la colección antes de importar (evita duplicados si corres el seed dos veces)
    await Medidor.deleteMany({})
    console.log('🧹 Colección limpiada')

    // Preparar documentos: mapear campos del JSON al esquema del modelo
    const documentos = datos.map((d) => ({
      instalacion:      d.instalacion      || d.nombre || null,
      numeroDePoste:    d.numeroDePoste    || null,
      numeroDeSerie:    d.numeroDeSerie    || null,
      marca:            d.marca            || null,
      zona:             d.zona             || null,
      establecimiento:  d.establecimiento  || null,
      proceso:          d.proceso          || null,
      tarifa:           d.tarifa           || null,
      unidadDeLectura:  d.unidadDeLectura  || null,
      contratista:      d.contratista      || null,
      direccion:        d.direccion        || null,
      fechaPlanificada: d.fechaPlanificada || null,
      ubicacion:        d.ubicacion        || undefined,
      estado:           d.estado === 'localizado' ? 'localizado' : 'pendiente',
      fotos:            [],
      observaciones:    null,
    }))

    // Insertar todo de una sola vez
    const resultado = await Medidor.insertMany(documentos, { ordered: false })
    console.log(`\n✅ ${resultado.length} medidores importados correctamente`)

    // Resumen por estado
    const localizados = documentos.filter(d => d.estado === 'localizado').length
    const pendientes  = documentos.filter(d => d.estado === 'pendiente').length
    console.log(`   - localizados: ${localizados}`)
    console.log(`   - pendientes:  ${pendientes}`)

  } catch (err) {
    console.error('❌ Error durante el seed:', err.message)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Desconectado de Atlas')
  }
}

seed()
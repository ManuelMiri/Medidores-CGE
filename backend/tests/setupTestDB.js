// tests/setupTestDB.js
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

let mongod

// Levanta un MongoDB temporal en memoria y conecta mongoose a él.
// Se llama UNA vez al principio de cada archivo de test (en beforeAll).
async function connect() {
  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()
  await mongoose.connect(uri)
}

// Borra todos los datos entre pruebas, para que un test no vea datos
// que dejó otro test anterior. Se llama en afterEach.
async function clearDatabase() {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany()
  }
}

// Apaga la conexión y el MongoDB temporal al terminar todos los tests
// del archivo. Se llama en afterAll.
async function closeDatabase() {
  await mongoose.connection.dropDatabase()
  await mongoose.connection.close()
  await mongod.stop()
}

module.exports = { connect, clearDatabase, closeDatabase }
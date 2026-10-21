import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARPETA, base64DeBlob, blobDeBase64, crearAlmacenArchivos, migrarCola, unirListas,
} from './archivosFotos.js'

// Un @capacitor/filesystem en memoria. `fallar(path)` hace fallar la escritura
// de ese archivo, para ver qué queda cuando se corta a la mitad.
function fsFalso({ fallar = () => false } = {}) {
  const archivos = new Map()
  const escrituras = []
  return {
    archivos,
    escrituras,
    async writeFile({ path, data }) {
      if (fallar(path)) throw new Error('sin espacio')
      escrituras.push(path)
      archivos.set(path, data)
    },
    async readFile({ path }) {
      if (!archivos.has(path)) throw new Error('no existe')
      return { data: archivos.get(path) }
    },
    async readdir({ path }) {
      const prefijo = path + '/'
      const nombres = [...archivos.keys()].filter((k) => k.startsWith(prefijo)).map((k) => k.slice(prefijo.length))
      if (!nombres.length) throw new Error('no existe la carpeta')
      return { files: nombres.map((name) => ({ name, type: 'file' })) }
    },
    async deleteFile({ path }) {
      if (!archivos.delete(path)) throw new Error('no existe')
    },
  }
}

// Un almacén en memoria con la forma del de IndexedDB (la imagen va adentro).
function almacenEnMemoria(fotos = [], { fallarAlQuitar = false } = {}) {
  const datos = new Map(fotos.map((f) => [f.idLocal, f]))
  return {
    datos,
    async guardar(f) { datos.set(f.idLocal, f) },
    async listar() { return [...datos.values()] },
    async leerImagen(f) { return f.blob },
    async quitar(id) { if (fallarAlQuitar) throw new Error('bloqueada'); datos.delete(id) },
  }
}

const bytesDe = async (blob) => [...new Uint8Array(await blob.arrayBuffer())]
const imagen = (n = 10) => new Blob([Uint8Array.from({ length: n }, (_, i) => i % 256)], { type: 'image/jpeg' })
const foto = (idLocal, extra = {}) => ({
  idLocal, instalacion: '103694009', nombre: 'Poste', lat: -35.4, lng: -71.6,
  fecha: '2026-10-21T15:00:00.000Z', error: null, intentos: 0, blob: imagen(), ...extra,
})

describe('base64', () => {
  test('ida y vuelta conserva todos los bytes, también en una foto de cientos de KB', async () => {
    const original = imagen(300 * 1024)
    const vuelta = blobDeBase64(await base64DeBlob(original))
    assert.deepEqual(await bytesDe(vuelta), await bytesDe(original))
    assert.equal(vuelta.type, 'image/jpeg')
  })

  test('va sin el prefijo data:, que es lo que pide Filesystem.writeFile', async () => {
    assert.ok(!(await base64DeBlob(imagen())).startsWith('data:'))
  })
})

describe('crearAlmacenArchivos', () => {
  test('escribe la imagen ANTES que los datos: si hay .json, la foto está completa', async () => {
    const fs = fsFalso()
    await crearAlmacenArchivos(fs, 'DATA', 'utf8').guardar(foto('a'))
    assert.deepEqual(fs.escrituras, [`${CARPETA}/a.jpg`, `${CARPETA}/a.json`])
  })

  test('la lista trae los datos sin la imagen', async () => {
    const almacen = crearAlmacenArchivos(fsFalso(), 'DATA', 'utf8')
    await almacen.guardar(foto('a'))
    const [f] = await almacen.listar()
    assert.equal(f.idLocal, 'a')
    assert.equal(f.nombre, 'Poste')
    assert.equal(f.blob, undefined)
  })

  test('la imagen se lee aparte y es la misma que se guardó', async () => {
    const almacen = crearAlmacenArchivos(fsFalso(), 'DATA', 'utf8')
    const original = foto('a')
    await almacen.guardar(original)
    const [f] = await almacen.listar()
    assert.deepEqual(await bytesDe(await almacen.leerImagen(f)), await bytesDe(original.blob))
  })

  test('sin carpeta todavía (ninguna foto nunca), la lista está vacía', async () => {
    assert.deepEqual(await crearAlmacenArchivos(fsFalso(), 'DATA', 'utf8').listar(), [])
  })

  test('una escritura cortada antes del .json no deja una foto rota en la cola', async () => {
    const fs = fsFalso({ fallar: (p) => p.endsWith('b.json') })
    const almacen = crearAlmacenArchivos(fs, 'DATA', 'utf8')
    await almacen.guardar(foto('a'))
    await assert.rejects(almacen.guardar(foto('b')))
    assert.deepEqual((await almacen.listar()).map((f) => f.idLocal), ['a'])
    // Y la imagen que alcanzó a escribirse no se borra: se puede rescatar.
    assert.ok(fs.archivos.has(`${CARPETA}/b.jpg`))
  })

  test('anotar un fallo (sin blob) reescribe solo los datos y la imagen sigue', async () => {
    const fs = fsFalso()
    const almacen = crearAlmacenArchivos(fs, 'DATA', 'utf8')
    await almacen.guardar(foto('a'))
    const [f] = await almacen.listar()
    await almacen.guardar({ ...f, error: 'Sin señal', intentos: 1 })
    const [g] = await almacen.listar()
    assert.equal(g.error, 'Sin señal')
    assert.equal(g.intentos, 1)
    assert.ok(fs.archivos.has(`${CARPETA}/a.jpg`))
  })

  test('quitar saca la foto y su imagen, y no falla si la imagen ya no estaba', async () => {
    const fs = fsFalso()
    const almacen = crearAlmacenArchivos(fs, 'DATA', 'utf8')
    await almacen.guardar(foto('a'))
    await almacen.guardar(foto('b'))
    await almacen.quitar('a')
    fs.archivos.delete(`${CARPETA}/b.jpg`)
    await almacen.quitar('b')
    assert.equal(fs.archivos.size, 0)
  })

  test('un .json ilegible no tapa a las demás', async () => {
    const fs = fsFalso()
    const almacen = crearAlmacenArchivos(fs, 'DATA', 'utf8')
    await almacen.guardar(foto('a'))
    fs.archivos.set(`${CARPETA}/roto.json`, '{ esto no es json')
    assert.deepEqual((await almacen.listar()).map((f) => f.idLocal), ['a'])
  })
})

describe('migrarCola', () => {
  test('pasa todas las fotos con su imagen y las saca del origen', async () => {
    const origen = almacenEnMemoria([foto('a'), foto('b')])
    const fs = fsFalso()
    const destino = crearAlmacenArchivos(fs, 'DATA', 'utf8')
    assert.deepEqual(await migrarCola(origen, destino), { pasadas: 2, quedaron: 0 })
    assert.equal(origen.datos.size, 0)
    const pasadas = await destino.listar()
    assert.deepEqual(pasadas.map((f) => f.idLocal).sort(), ['a', 'b'])
    assert.equal((await destino.leerImagen(pasadas[0])).size, 10)
  })

  test('si una no se puede escribir, queda en el origen: nunca en ninguno', async () => {
    const origen = almacenEnMemoria([foto('a'), foto('b')])
    const destino = crearAlmacenArchivos(fsFalso({ fallar: (p) => p.includes('/b.') }), 'DATA', 'utf8')
    assert.deepEqual(await migrarCola(origen, destino), { pasadas: 1, quedaron: 1 })
    assert.deepEqual([...origen.datos.keys()], ['b'])
    assert.deepEqual((await destino.listar()).map((f) => f.idLocal), ['a'])
  })

  test('si no se puede sacar del origen, queda en los dos (se ve una vez, ver unirListas)', async () => {
    const origen = almacenEnMemoria([foto('a')], { fallarAlQuitar: true })
    const destino = crearAlmacenArchivos(fsFalso(), 'DATA', 'utf8')
    assert.deepEqual(await migrarCola(origen, destino), { pasadas: 0, quedaron: 1 })
    assert.equal(origen.datos.size, 1)
    assert.equal((await destino.listar()).length, 1)
  })

  test('con el origen vacío no hace nada', async () => {
    assert.deepEqual(await migrarCola(almacenEnMemoria(), crearAlmacenArchivos(fsFalso(), 'DATA', 'utf8')),
      { pasadas: 0, quedaron: 0 })
  })
})

test('unirListas no repite una foto que está en los dos almacenes; gana la primera lista', () => {
  const unidas = unirListas([{ idLocal: 'a', origen: 'archivos' }], [{ idLocal: 'a', origen: 'indexeddb' }, { idLocal: 'b' }])
  assert.deepEqual(unidas.map((f) => `${f.idLocal}:${f.origen ?? '-'}`), ['a:archivos', 'b:-'])
})

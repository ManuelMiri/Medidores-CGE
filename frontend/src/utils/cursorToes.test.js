// Pruebas de la aritmética del cursor de lectura incremental.
//   npm test
//
// Lo que se protege acá: que leer un log de a trozos dé exactamente el mismo
// resultado que leerlo entero. Si el cursor se corre, no hay error visible —
// el lector simplemente ve como pendiente un punto que ya tomó, o al revés.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  bytesDePrefijo,
  cursorInicial,
  avanceDeCursor,
  topeSiguiente,
  MARCA_BLOQUE,
} from './cursorToes.js'
import { parsearLog, estadoPorInstalacion, estadoDeUL } from './toesParser.js'
import { bloqueServicio, lineaCierre, lineaRuido, cabecera } from './__fixtures__/logSintetico.js'

const codificador = new TextEncoder()
const bytes = (s) => codificador.encode(s).length

describe('bytesDePrefijo', () => {
  test('cuenta bytes y no caracteres', () => {
    // "aplicación" trae un acento: 1 carácter, 2 bytes.
    const texto = cabecera()
    assert.ok(bytes(texto) > texto.length, 'el fixture tiene que traer acentos')
    assert.equal(bytesDePrefijo(texto), bytes(texto))
  })

  test('un prefijo con acento pesa más que su largo en caracteres', () => {
    const texto = 'aplicación: ok'
    assert.equal(bytesDePrefijo(texto, 10), bytes('aplicación'))
    assert.equal(bytesDePrefijo(texto, 10), 11)
  })

  test('los extremos no se pasan del texto', () => {
    assert.equal(bytesDePrefijo('abc', 0), 0)
    assert.equal(bytesDePrefijo('abc', -5), 0)
    assert.equal(bytesDePrefijo('abc', 99), 3)
  })
})

describe('cursorInicial', () => {
  test('sin registro previo empieza de cero', () => {
    assert.equal(cursorInicial(undefined, 100), 0)
    assert.equal(cursorInicial(null, 100), 0)
  })

  test('un cursor guardado en caracteres se descarta', () => {
    // Migración: los teléfonos que ya habían leído logs con la versión vieja
    // tenían el cursor en caracteres y no es comparable con bytes.
    const previo = { cursor: 500, tamano: 900, unidadOffset: 'chars' }
    assert.equal(cursorInicial(previo, 900), 0)
  })

  test('continúa donde quedó si el archivo creció', () => {
    const previo = { cursor: 500, tamano: 900, unidadOffset: 'bytes' }
    assert.equal(cursorInicial(previo, 1200), 500)
  })

  test('si el archivo se achicó, relee entero', () => {
    const previo = { cursor: 500, tamano: 900, unidadOffset: 'bytes' }
    assert.equal(cursorInicial(previo, 400), 0)
  })

  test('nunca devuelve un cursor más allá del final', () => {
    const previo = { cursor: 5000, tamano: 100, unidadOffset: 'bytes' }
    assert.equal(cursorInicial(previo, 100), 100)
  })

  test('un cursor corrupto no rompe nada', () => {
    assert.equal(cursorInicial({ cursor: NaN, unidadOffset: 'bytes' }, 100), 0)
    assert.equal(cursorInicial({ cursor: '500', unidadOffset: 'bytes' }, 100), 0)
  })
})

describe('avanceDeCursor', () => {
  test('el parser deja afuera el salto de línea que cierra el bloque', () => {
    // Por eso el camino habitual es el de conversión por prefijo y no el
    // atajo: TOES siempre termina la línea, así que consumido queda un byte
    // antes del final del archivo.
    const texto = cabecera() + bloqueServicio()
    assert.equal(parsearLog(texto).consumido, texto.length - 1)
  })

  test('si el parser consumió todo, avanza lo que se leyó del archivo', () => {
    const texto = (cabecera() + bloqueServicio()).trimEnd()
    const r = parsearLog(texto)
    assert.equal(r.consumido, texto.length)
    // Se devuelve bytesLeidos tal cual, sin reconvertir: con acentos en el
    // trozo, usar texto.length acá dejaría el cursor corto.
    assert.equal(avanceDeCursor(texto, r.consumido, bytes(texto)), bytes(texto))
    assert.notEqual(bytes(texto), texto.length)
  })

  test('si quedó un bloque a medio escribir, avanza solo hasta el anterior', () => {
    const completo = cabecera() + bloqueServicio({ instalacion: 'Z1' })
    const aMedias = bloqueServicio({ instalacion: 'Z2' }).slice(0, 80)
    const texto = completo + aMedias
    const r = parsearLog(texto)

    assert.ok(r.consumido > 0 && r.consumido < texto.length)
    // El avance tiene que medir el prefijo en bytes, no en caracteres.
    assert.equal(avanceDeCursor(texto, r.consumido, bytes(texto)), bytes(texto.slice(0, r.consumido)))
  })

  test('sin bloques y sin más archivo, no avanza', () => {
    // La cola que TOES está escribiendo ahora. Se vuelve a leer en la próxima
    // vuelta, que es lo correcto: todavía no hay nada que procesar.
    const texto = lineaRuido()
    assert.equal(parsearLog(texto).consumido, 0)
    assert.equal(avanceDeCursor(texto, 0, bytes(texto), false), 0)
  })

  test('sin bloques pero con más archivo, avanza hasta la última línea completa', () => {
    // Si no avanzara, cada vuelta leería el mismo trozo para siempre.
    const texto = lineaRuido() + 'linea sin terminar'
    const esperado = bytes(texto.slice(0, texto.lastIndexOf('\n') + 1))
    assert.equal(avanceDeCursor(texto, 0, bytes(texto), true), esperado)
  })

  test('con un bloque que no cierra en el trozo, avanza hasta justo antes del bloque', () => {
    const texto = lineaRuido() + bloqueServicio().slice(0, 120)
    const marca = texto.indexOf(MARCA_BLOQUE)
    assert.notEqual(marca, -1, 'el trozo tiene que incluir el marcador completo')
    const esperado = bytes(texto.slice(0, texto.lastIndexOf('\n', marca) + 1))

    const avance = avanceDeCursor(texto, 0, bytes(texto), true)
    assert.equal(avance, esperado)
    // Lo importante: avanza, pero nunca se come el bloque sin parsear.
    assert.ok(avance > 0)
    assert.ok(avance <= bytes(texto.slice(0, marca)))
  })

  test('si el bloque empieza en el cursor y no entra, no avanza', () => {
    // Se prefiere quedarse pegado antes que perder el bloque. El llamador
    // reintenta con una ventana más grande.
    const texto = bloqueServicio().slice(0, 120)
    assert.equal(avanceDeCursor(texto, 0, bytes(texto), true), 0)
  })

  test('un trozo cortado en mitad del marcador no se traga el bloque', () => {
    // El corte cae antes de que "Backup de la lectura (" esté completo, así que
    // indexOf no lo ve. Igual no se pierde: no hay ningún salto de línea del
    // bloque en el trozo, porque el marcador va antes del primero.
    const texto = lineaRuido() + bloqueServicio().slice(0, 45)
    assert.equal(texto.indexOf(MARCA_BLOQUE), -1, 'el marcador tiene que quedar cortado')
    const avance = avanceDeCursor(texto, 0, bytes(texto), true)
    assert.equal(avance, bytes(lineaRuido()), 'avanza solo el ruido, no entra al bloque')
  })
})

describe('lectura por trozos', () => {
  // Simula el ciclo completo del plugin nativo: leer un pedazo, parsearlo,
  // avanzar el cursor, repetir. El resultado tiene que ser idéntico a leer el
  // archivo de una sola vez.
  function leerPorTrozos(log, topeInicial) {
    const crudo = codificador.encode(log)
    const decodificador = new TextDecoder()
    let cursor = 0
    let tope = topeInicial
    let eventos = []
    let cierres = []
    let vueltas = 0

    while (cursor < crudo.length) {
      if (++vueltas > 1000) throw new Error('el cursor se quedó pegado')

      // Lo que hace ToesPlugin.leerLog: leer hasta el tope y, si el archivo
      // sigue, cortar en el último salto de línea.
      let fin = Math.min(cursor + tope, crudo.length)
      const hayMas = fin < crudo.length
      if (hayMas) {
        while (fin > cursor && crudo[fin - 1] !== 0x0a) fin--
        if (fin === cursor) fin = Math.min(cursor + tope, crudo.length)
      }
      const trozo = decodificador.decode(crudo.slice(cursor, fin))
      const leidos = fin - cursor

      // Procesar SIEMPRE, antes de decidir el avance. Un trozo puede traer un
      // cierre de ruta sin ningún bloque: `consumido` no avanza por los
      // cierres, así que si se saltara el procesamiento cuando el cursor no
      // se mueve, la línea de "Cierre Final" no se aplicaría nunca. Volver a
      // procesar es inofensivo: los eventos se deduplican por UL + ciclo +
      // instalación y los cierres por UL + tipo + fecha.
      const r = parsearLog(trozo)
      eventos = eventos.concat(r.eventos)
      cierres = cierres.concat(r.cierres)

      const avance = avanceDeCursor(trozo, r.consumido, leidos, fin < crudo.length)
      if (avance > 0) {
        cursor += avance
        continue
      }
      // No se pudo avanzar. Si el archivo sigue, es porque el bloque no entró
      // en la ventana: se reintenta el mismo cursor con una más grande.
      if (fin < crudo.length) {
        const mayor = topeSiguiente(tope)
        if (mayor) {
          tope = mayor
          continue
        }
      }
      break // cola a medio escribir: se relee en la próxima vuelta
    }
    return { eventos, cierres, cursor, total: crudo.length }
  }

  const log =
    cabecera() +
    bloqueServicio({ instalacion: 'Z1', medidor: 'M1' }) +
    lineaRuido() +
    bloqueServicio({ instalacion: 'Z2', medidor: 'M2', clave: '08' }) +
    bloqueServicio({ instalacion: 'Z3', medidor: 'M3', calle: 'LOS LITRES {ojo}' }) +
    lineaRuido() +
    bloqueServicio({ instalacion: 'Z4', medidor: 'M4' }) +
    lineaCierre('E9999999', 'Final')

  const entero = parsearLog(log)

  test('el fixture tiene acentos, o la prueba no prueba nada', () => {
    assert.notEqual(bytes(log), log.length)
  })

  for (const tope of [64, 200, 512, 1500, 4096, 100000]) {
    test(`con trozos de ${tope} bytes da lo mismo que de una vez`, () => {
      const porTrozos = leerPorTrozos(log, tope)

      assert.deepEqual(
        porTrozos.eventos.map((e) => e.instalacion),
        entero.eventos.map((e) => e.instalacion),
        'mismos eventos y en el mismo orden'
      )
      // Ni duplicados ni perdidos: 4 bloques, 4 eventos.
      assert.equal(porTrozos.eventos.length, 4)
      assert.equal(new Set(porTrozos.eventos.map((e) => e.instalacion)).size, 4)
    })
  }

  test('el estado del mapa queda igual leído de a trozos', () => {
    const porTrozos = leerPorTrozos(log, 300)
    const a = estadoDeUL(estadoPorInstalacion(porTrozos.eventos), 'E9999999')
    const b = estadoDeUL(estadoPorInstalacion(entero.eventos), 'E9999999')
    assert.deepEqual([...a.keys()].sort(), [...b.keys()].sort())
    assert.equal(a.size, 4)
  })

  test('un cierre partido entre dos trozos no se pierde', () => {
    // El cierre es la última línea: con un tope chico cae a caballo de dos
    // trozos, y el corte en el salto de línea es lo que lo mantiene entero.
    const porTrozos = leerPorTrozos(log, 128)
    assert.ok(porTrozos.cierres.some((c) => c.tipo === 'final' && c.unidad === 'E9999999'))
  })

  test('releer desde el cursor no duplica nada', () => {
    // Lo que pasa de verdad cada 5 s: el archivo creció y se lee solo la cola.
    const primero = leerPorTrozos(log, 100000)
    const crecido = log + bloqueServicio({ instalacion: 'Z5', medidor: 'M5' })
    const crudo = codificador.encode(crecido)
    const cola = new TextDecoder().decode(crudo.slice(primero.cursor))

    const r = parsearLog(cola)
    const estado = estadoPorInstalacion(
      primero.eventos.concat(r.eventos)
    )
    const tomados = estadoDeUL(estado, 'E9999999')
    assert.equal(tomados.size, 5, 'los 4 de antes más el nuevo, sin repetir')
    assert.equal(r.eventos.length, 1, 'de la cola sale solo el bloque nuevo')
  })
})

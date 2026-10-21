import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { armarReporte, textoLista, textoReporte } from './reporteRuta.js'
import config from '../config/clavesToes.json' with { type: 'json' }

const UL = 'E3550001'
const CICLO = '2026-10-14'
const pin = (instalacion, extra = {}) => ({ instalacion, unidadDeLectura: UL, ...extra })
const tomado = (instalacion, clave = null) => [instalacion, { instalacion, clave, tomado: true }]

function escenario() {
  // 12 pines en la ruta; 9 tomados; uno tomado que no tenía pin.
  const medidores = Array.from({ length: 12 }, (_, i) => pin('P' + i))
  medidores.push(pin('NUEVO', { desdeToes: { ciclo: CICLO } }))
  medidores.push({ instalacion: 'DE-OTRA-UL', unidadDeLectura: 'OTRA' })
  const tomados = new Map([
    tomado('P0'), tomado('P1'), tomado('P2'),
    tomado('P3', '01'), tomado('P4', '01'), tomado('P5', '09'),
    tomado('P6', '26'),
    tomado('P7', '10'),
    tomado('P8', '11'),
    tomado('NUEVO'),
    tomado('SIN-PIN'),
  ])
  // "especial" es como lo escribe TOES ("Cierre Especial"): el cierre parcial.
  return { ul: UL, datos: { ciclo: CICLO, tomados, cierre: { tipo: 'especial' } }, medidores, config }
}

describe('armarReporte', () => {
  test('cuenta cada categoría y las de la ruta suman el total', () => {
    const r = armarReporte(escenario())
    assert.equal(r.total, 13) // los 12 + el creado desde TOES; no cuenta otra UL
    assert.equal(r.leidos, 5) // P0, P1, P2, NUEVO, SIN-PIN
    assert.equal(r.cerradas.total, 3)
    assert.equal(r.eriazos, 1)
    assert.equal(r.cambios, 1)
    assert.equal(r.otras.total, 1)
    assert.equal(r.pendientes, 3) // P9, P10, P11
    // tomados con pin + pendientes = total
    assert.equal(r.leidos - 1 + r.cerradas.total + r.eriazos + r.cambios + r.otras.total + r.pendientes, r.total)
  })

  test('separa las casas cerradas por tipo, sin el prefijo repetido', () => {
    const r = armarReporte(escenario())
    const sinItems = (d) => d.map(({ clave, nombre, n }) => ({ clave, nombre, n }))
    assert.deepEqual(sinItems(r.cerradas.detalle), [
      { clave: '01', nombre: 'Medidor interior', n: 2 },
      { clave: '09', nombre: 'Medidor mal ubicado', n: 1 },
    ])
    assert.deepEqual(sinItems(r.otras.detalle), [{ clave: '11', nombre: 'Posible CNR', n: 1 }])
  })

  test('nuevos: los creados desde TOES en este ciclo y los que aún no tienen pin', () => {
    assert.equal(armarReporte(escenario()).nuevos, 2)
  })

  test('un pin creado desde TOES en otro ciclo ya no es nuevo', () => {
    const e = escenario()
    e.medidores.find((m) => m.instalacion === 'NUEVO').desdeToes.ciclo = '2026-09-14'
    assert.equal(armarReporte(e).nuevos, 1)
  })

  test('sin datos de TOES no revienta', () => {
    const r = armarReporte({ ul: UL, datos: undefined, medidores: [], config })
    assert.equal(r.total, 0)
    assert.equal(r.avance, 0)
  })
})

describe('listas para copiar', () => {
  // Las series: la del log es S-<instalación>; la de la base, B-<instalación>.
  // Las fechas van al revés del orden de la ruta, para ver que se ordena por
  // cuándo se leyó y no por cómo vino el Map.
  function conSeries() {
    const e = escenario()
    let minuto = 59
    for (const [inst, t] of e.datos.tomados) {
      t.medidor = 'S-' + inst
      t.fecha = `2026-10-14T10:${String(minuto--).padStart(2, '0')}:00`
    }
    for (const m of e.medidores) m.numeroDeSerie = 'B-' + m.instalacion
    return e
  }
  const instalaciones = (items) => items.map((x) => x.instalacion)

  test('cada categoría trae su lista, del mismo largo que su número', () => {
    const r = armarReporte(conSeries())
    assert.equal(r.listas.leidos.length, r.leidos)
    assert.equal(r.listas.cerradas.length, r.cerradas.total)
    assert.equal(r.listas.eriazos.length, r.eriazos)
    assert.equal(r.listas.cambios.length, r.cambios)
    assert.equal(r.listas.otras.length, r.otras.total)
    assert.equal(r.listas.pendientes.length, r.pendientes)
    assert.equal(r.listas.nuevos.length, r.nuevos)
  })

  test('las casas cerradas van con la serie del log, en el orden en que se leyeron', () => {
    const r = armarReporte(conSeries())
    assert.deepEqual(instalaciones(r.listas.cerradas), ['P5', 'P4', 'P3'])
    assert.equal(r.listas.cerradas[0].serie, 'S-P5')
  })

  test('cada clave del detalle trae su propia lista', () => {
    const r = armarReporte(conSeries())
    const interior = r.cerradas.detalle.find((x) => x.clave === '01')
    assert.deepEqual(instalaciones(interior.items), ['P4', 'P3'])
  })

  test('los pendientes, con la serie de la base, ordenados por instalación', () => {
    const r = armarReporte(conSeries())
    assert.deepEqual(r.listas.pendientes, [
      { instalacion: 'P9', serie: 'B-P9' },
      { instalacion: 'P10', serie: 'B-P10' },
      { instalacion: 'P11', serie: 'B-P11' },
    ])
  })

  test('un cambio de medidor lista la serie NUEVA, con la anterior', () => {
    const e = conSeries()
    e.cambiosMedidor = [
      { unidad: UL, ciclo: CICLO, instalacion: 'P7', serie: 'NUEVA-7', serieAnterior: 'S-P7' },
      // de otro ciclo y de otra UL: no cuentan
      { unidad: UL, ciclo: '2026-09-14', instalacion: 'P7', serie: 'VIEJA-CICLO' },
      { unidad: 'OTRA', ciclo: CICLO, instalacion: 'P7', serie: 'OTRA-UL' },
    ]
    const [c] = armarReporte(e).listas.cambios
    assert.equal(c.serie, 'NUEVA-7')
    assert.equal(c.serieAnterior, 'S-P7')
  })

  test('sin el bloque del cambio, la serie nueva sale de la base si ya cambió', () => {
    const [c] = armarReporte(conSeries()).listas.cambios
    assert.equal(c.serie, 'B-P7')
    assert.equal(c.serieAnterior, 'S-P7')
  })

  test('textoLista: una línea por servicio, lista para pegar', () => {
    assert.equal(textoLista([
      { instalacion: '103694009', serie: 'E3550001' },
      { instalacion: 'G3534036', serie: null },
      { instalacion: 'E713709426', serie: '8822', serieAnterior: '7711' },
    ]), '103694009 - E3550001\nG3534036\nE713709426 - 8822 (antes 7711)')
  })
})

describe('textoReporte', () => {
  test('arma el texto para WhatsApp, con el detalle y sin lecturas', () => {
    const texto = textoReporte(armarReporte(escenario()))
    assert.match(texto, /^📋 \*Ruta E3550001\* · ciclo 14-10-2026 \(cierre parcial\)/)
    assert.match(texto, /✅ Leídos: \*5\*/)
    assert.match(texto, /• Medidor interior \(01\): 2/)
    assert.match(texto, /⚠️ Otras claves: \*1\*/)
    assert.match(texto, /🆕 Nuevos \(no venían en la ruta\): \*2\*/)
  })

  test('el cierre final dice "ruta cerrada"; sin cierre, "en curso"', () => {
    const e = escenario()
    e.datos.cierre = { tipo: 'final' }
    assert.match(textoReporte(armarReporte(e)), /\(ruta cerrada\)/)
    e.datos.cierre = null
    assert.match(textoReporte(armarReporte(e)), /\(en curso\)/)
  })

  test('sin otras claves no muestra esa línea', () => {
    const e = escenario()
    e.datos.tomados.delete('P8')
    assert.doesNotMatch(textoReporte(armarReporte(e)), /Otras claves/)
  })
})

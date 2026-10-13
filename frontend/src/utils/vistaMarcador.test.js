// Tests de la capa de visibilidad del mapa.
//
// El mapa agrupa en un solo pin los medidores que están a menos de 5 m, así
// que la decisión de ocultar es por grupo y no por medidor. Eso abre casos que
// con un pin por medidor no existían: un grupo donde TOES tomó algunos pero no
// todos tiene que seguir visible, y el contador del pin tiene que decir cuántos
// quedan por visitar y no cuántos hay en total.
//
// vistaMarcador.js importa Leaflet, que al cargarse necesita window y document.
// Con un stub mínimo alcanza: L.divIcon solo arma un objeto de opciones hasta
// que el icono se agrega a un mapa de verdad, y acá nunca se agrega.
const elemento = () => ({
  style: {}, setAttribute() {}, appendChild() {},
  classList: { add() {}, remove() {} }, getContext: () => null,
})
globalThis.window = {
  devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, screen: {},
}
globalThis.document = {
  documentElement: elemento(), createElement: elemento, createElementNS: elemento,
  addEventListener() {}, removeEventListener() {}, body: elemento(),
}

import test from 'node:test'
import assert from 'node:assert/strict'

const { vistaDeGrupo, estadoToesDe, iconoColor, esRepaso } = await import('./vistaMarcador.js')
const config = (await import('../config/clavesToes.json', { with: { type: 'json' } })).default

// Iconos por estado de mapeo, como los que tiene Mapa.jsx. Lo único que
// importa acá es poder distinguir cuál devolvió.
const iconos = {
  pendiente: { nombre: 'pendiente', options: { iconUrl: 'pendiente.png' } },
  localizado: { nombre: 'localizado', options: { iconUrl: 'localizado.png' } },
}

function medidor(id, instalacion, estado = 'pendiente') {
  return { _id: id, instalacion, estado, ubicacion: { coordinates: [-71.6, -35.5] } }
}

// Índice como el que arma useToes: solo las instalaciones que TOES tomó.
function indiceCon(...tomados) {
  const porInstalacion = new Map()
  for (const t of tomados) {
    porInstalacion.set(t.instalacion, {
      instalacion: t.instalacion, clave: t.clave ?? null,
      conLectura: !t.clave, fecha: '2026-10-06T15:42:00', tomado: true,
    })
  }
  return { porInstalacion, porMedidor: new Map() }
}

test('grupo sin nada tomado: visible, completo y sin atenuar', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102'), medidor('c', '103')]
  const v = vistaDeGrupo(grupo, indiceCon(), config, iconos, false, null)
  assert.equal(v.oculto, false)
  assert.equal(v.visibles.length, 3)
  assert.equal(v.opacidad, 1)
})

test('grupo con algunos tomados: queda visible y el contador baja', () => {
  // Es el caso que el pin agrupado introduce: si se ocultara el pin completo,
  // el lector perdería el único medidor del punto que todavía tiene que ir a
  // buscar.
  const grupo = [medidor('a', '101'), medidor('b', '102'), medidor('c', '103')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101' }, { instalacion: '102' }), config, iconos, false, null)
  assert.equal(v.oculto, false)
  assert.deepEqual(v.visibles.map(m => m.instalacion), ['103'])
  // sin atenuar: todavía hay algo pendiente en este punto
  assert.equal(v.opacidad, 1)
})

test('grupo con todo tomado: el pin desaparece', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101' }, { instalacion: '102' }), config, iconos, false, null)
  assert.equal(v.oculto, true)
  assert.equal(v.visibles.length, 0)
})

test('"Ver tomados": vuelve el grupo completo y atenuado', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const idx = indiceCon({ instalacion: '101' }, { instalacion: '102' })
  const v = vistaDeGrupo(grupo, idx, config, iconos, true, null)
  assert.equal(v.oculto, false)
  assert.equal(v.visibles.length, 2)
  assert.equal(v.opacidad, 0.35)
})

test('"Ver tomados" en un grupo mezclado no atenúa', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101' }), config, iconos, true, null)
  assert.equal(v.visibles.length, 2)
  assert.equal(v.opacidad, 1)
})

test('un medidor elegido a propósito se muestra aunque TOES lo haya tomado', () => {
  // Sin esta excepción, buscar una instalación ya tomada no mostraría nada y
  // el buscador parecería roto.
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const idx = indiceCon({ instalacion: '101' }, { instalacion: '102' })
  const v = vistaDeGrupo(grupo, idx, config, iconos, false, 'b')
  assert.equal(v.oculto, false)
  assert.deepEqual(v.visibles.map(m => m._id), ['b'])
  assert.equal(v.opacidad, 0.35)
})

test('medidor solo y tomado con clave: pin del color de la clave', () => {
  const grupo = [medidor('a', '101')]
  const idx = indiceCon({ instalacion: '101', clave: '08' })
  const v = vistaDeGrupo(grupo, idx, config, iconos, true, null)
  // divIcon de color, no uno de los iconos por estado
  assert.equal(v.icono.options.html.includes(config.claves['08'].color), true)
})

test('una clave fuera de la configuración usa el color neutro, no rompe', () => {
  const grupo = [medidor('a', '101')]
  const idx = indiceCon({ instalacion: '101', clave: '99' })
  const v = vistaDeGrupo(grupo, idx, config, iconos, true, null)
  assert.equal(v.icono.options.html.includes(config.colorClaveDesconocida), true)
})

test('grupo de varios visibles: icono con iconUrl, para que acepte el contador', () => {
  // iconoConContador (en Mapa.jsx) lee options.iconUrl para pegarle el número
  // encima. Un divIcon de color no lo tiene, así que el color de clave nunca
  // debe salir cuando hay más de un visible.
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const idx = indiceCon({ instalacion: '101', clave: '08' })
  const v = vistaDeGrupo(grupo, idx, config, iconos, true, null)
  assert.equal(v.visibles.length, 2)
  assert.ok(v.icono.options.iconUrl, 'el icono del grupo tiene que tener iconUrl')
})

test('el icono sale del primer visible, no del primero del grupo', () => {
  // Si el primero del grupo está oculto, su estado no debe decidir el color.
  const grupo = [medidor('a', '101', 'localizado'), medidor('b', '102', 'pendiente')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101' }), config, iconos, false, null)
  assert.equal(v.icono.nombre, 'pendiente')
})

test('toesPorId trae el estado de cada tomado, para el popup', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '11' }), config, iconos, true, null)
  assert.equal(v.toesPorId.get('a').clave, '11')
  assert.equal(v.toesPorId.has('b'), false)
})

test('estadoToesDe no cruza por numeroDeSerie si el punto trae instalación', () => {
  // La instalación es el identificador fuerte: el respaldo por número de
  // medidor existe solo para los puntos que no tienen instalación.
  const idx = { porInstalacion: new Map(), porMedidor: new Map([['G123', { instalacion: 'otra' }]]) }
  const conInstalacion = { instalacion: '101', numeroDeSerie: 'G123' }
  assert.equal(estadoToesDe(conInstalacion, idx), null)
  const sinInstalacion = { instalacion: '', numeroDeSerie: 'G123' }
  assert.equal(estadoToesDe(sinInstalacion, idx).instalacion, 'otra')
})

// --------------------------------------------------------------- marca permanente
//
// Lo que se protege acá es el objetivo de toda la funcionalidad: que el lector
// del mes siguiente —que puede ser otra persona— VEA que en ese punto ya no
// hay medidor y no pierda tiempo buscándolo.

function conMarca(m, tipo, situacion = 'confirmada') {
  return { ...m, marcaPermanente: { tipo, situacion, claveToes: '26', cicloOrigen: '2026-10-06' } }
}

test('un punto marcado NO se oculta aunque TOES lo haya tomado', () => {
  // El caso que importa: TOES reporta el eriazo cada mes, así que sin esta
  // excepción el punto quedaría oculto justo para quien necesita verlo.
  const grupo = [conMarca(medidor('a', '101'), 'sitioEriazo')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '26' }), config, iconos, false, null)
  assert.equal(v.oculto, false)
  assert.deepEqual(v.visibles.map(m => m.instalacion), ['101'])
})

test('un punto marcado se ve en firme, no atenuado como los tomados', () => {
  const grupo = [conMarca(medidor('a', '101'), 'sitioEriazo')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '26' }), config, iconos, false, null)
  assert.equal(v.opacidad, 1)
})

test('una marca solo propuesta se ve más suave que una confirmada', () => {
  const grupo = [conMarca(medidor('a', '101'), 'sitioEriazo', 'propuesta')]
  const v = vistaDeGrupo(grupo, indiceCon(), config, iconos, false, null)
  assert.equal(v.opacidad, 0.75)
  assert.equal(v.marca.situacion, 'propuesta')
})

test('el pin toma el color del tipo de marca', () => {
  const grupo = [conMarca(medidor('a', '101'), 'sitioEriazo')]
  const v = vistaDeGrupo(grupo, indiceCon(), config, iconos, false, null)
  assert.equal(v.icono, iconoColor(config.etiquetas.sitioEriazo.color))
})

test('la marca manda sobre el color de la clave de TOES', () => {
  // La clave es de este ciclo; la marca es un hecho permanente.
  const grupo = [conMarca(medidor('a', '101'), 'noEncontrado')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '11' }), config, iconos, false, null)
  assert.equal(v.icono, iconoColor(config.etiquetas.noEncontrado.color))
  assert.notEqual(v.icono, iconoColor(config.claves['11'].color))
})

test('en un grupo mezclado, el marcado arrastra al pin a verse siempre', () => {
  const grupo = [
    conMarca(medidor('a', '101'), 'sitioEriazo'),
    medidor('b', '102'),
  ]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '26' }, { instalacion: '102' }), config, iconos, false, null)
  assert.equal(v.oculto, false)
  assert.deepEqual(v.visibles.map(m => m.instalacion), ['101'])
})

test('sin marca, nada cambia respecto de antes', () => {
  const grupo = [medidor('a', '101')]
  const v = vistaDeGrupo(grupo, indiceCon(), config, iconos, false, null)
  assert.equal(v.marca, null)
  assert.equal(v.opacidad, 1)
})

test('una marca rechazada no pinta ni fuerza la visibilidad del punto', () => {
  // Alguien ya dijo "acá sí hay medidor": el punto vuelve a comportarse como
  // cualquier otro, aunque la marca quede guardada para no reproponerla.
  const grupo = [conMarca(medidor('a', '101'), 'sitioEriazo', 'rechazada')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '26' }), config, iconos, false, null)
  assert.equal(v.oculto, true)
  assert.equal(v.marca ?? null, null)
})

// El color suelto lo necesita el motor sobre GPU: allá el pin no es un divIcon
// con un SVG adentro sino una imagen que hay que generar por color. Si `color`
// y `icono` se separaran, el mapa de GL pintaría un tono y el de Leaflet otro
// para el mismo punto — y la diferencia solo se vería comparando los dos.

test('sin clave ni marca no hay color: manda el estado de mapeo', () => {
  const v = vistaDeGrupo([medidor('a', '101')], indiceCon(), config, iconos, false, null)
  assert.equal(v.color, null)
  assert.equal(v.icono.nombre, 'pendiente')
})

test('tomado con clave: el color es el de la clave', () => {
  const v = vistaDeGrupo([medidor('a', '101')], indiceCon({ instalacion: '101', clave: '26' }), config, iconos, true, null)
  assert.equal(v.color, config.claves['26'].color)
  // y es el mismo tono que el icono que usa Leaflet
  assert.equal(v.icono, iconoColor(v.color))
})

test('una clave que no está en la tabla sale con el color neutro', () => {
  const v = vistaDeGrupo([medidor('a', '101')], indiceCon({ instalacion: '101', clave: 'ZZ' }), config, iconos, true, null)
  assert.equal(v.color, config.colorClaveDesconocida)
})

test('con varios visibles no hay color: ningún tono representa al grupo', () => {
  // Es la misma razón por la que el pin con contador usa la imagen del estado:
  // con dos medidores de claves distintas no hay un color que valga por los dos.
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '101', clave: '26' }), config, iconos, true, null)
  assert.equal(v.visibles.length, 2)
  assert.equal(v.color, null)
})

// --- Repaso de casas cerradas ----------------------------------------------
// Al terminar la ruta el lector quiere ver SOLO las casas que quedaron
// cerradas, para volver a pasar por ellas sin revisar pin por pin.

test('repaso: las variantes de casa cerrada son 01, 08, 09 y 30', () => {
  for (const c of ['01', '08', '09', '30']) {
    assert.match(config.claves[c].nombre, /^Casa cerrada/i, `clave ${c}`)
    assert.ok(esRepaso({ clave: c }, config), `clave ${c}`)
  }
  // Ninguna otra clave de la tabla empieza con "Casa cerrada": si CGE agrega
  // una variante nueva, este test avisa que falta sumarla a clavesRepaso.
  const cerradas = Object.entries(config.claves)
    .filter(([, d]) => /^Casa cerrada/i.test(d.nombre)).map(([c]) => c).sort()
  assert.deepEqual(cerradas, [...config.clavesRepaso].sort())
})

test('repaso: no cuentan las lecturas, otras claves ni lo no tomado', () => {
  assert.equal(esRepaso(null, config), false)
  assert.equal(esRepaso({ clave: null, conLectura: true }, config), false)
  assert.equal(esRepaso({ clave: '26' }, config), false)
})

test('repaso: solo quedan las casas cerradas, en firme y con su color', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102'), medidor('c', '103')]
  // 101 cerrada, 102 leída, 103 sin visitar
  const indice = indiceCon({ instalacion: '101', clave: '08' }, { instalacion: '102' })
  const v = vistaDeGrupo(grupo, indice, config, iconos, false, null, true)
  assert.deepEqual(v.visibles.map((m) => m._id), ['a'])
  assert.equal(v.opacidad, 1) // tomada, pero es lo que hay que ir a ver
  assert.equal(v.color, config.claves['08'].color)
})

test('repaso: un grupo sin casas cerradas desaparece, aunque falte visitarlo', () => {
  const grupo = [medidor('a', '101'), medidor('b', '102')]
  const v = vistaDeGrupo(grupo, indiceCon({ instalacion: '102', clave: '26' }), config, iconos, true, null, true)
  assert.equal(v.oculto, true)
})

test('repaso: la marca permanente no se cuela, el seleccionado sí', () => {
  const conMarca = { ...medidor('a', '101'), marcaPermanente: { tipo: 'sitioEriazo', situacion: 'confirmada' } }
  const v1 = vistaDeGrupo([conMarca], indiceCon(), config, iconos, false, null, true)
  assert.equal(v1.oculto, true)
  // buscar una instalación tiene que mostrarla siempre, o el buscador parece roto
  const v2 = vistaDeGrupo([medidor('b', '102')], indiceCon(), config, iconos, false, 'b', true)
  assert.equal(v2.oculto, false)
})

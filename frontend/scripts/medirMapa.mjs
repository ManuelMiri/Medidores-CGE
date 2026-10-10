// Mide la fluidez del mapa en el telefono, con un gesto REPETIBLE.
//
// Por que existe: "arrastrar se siente a saltos" no se puede verificar ni
// comparar entre dos builds. Arrastrar a mano tampoco sirve de referencia,
// porque nunca es el mismo gesto dos veces: cambia el largo, la velocidad y
// cuantos tiles nuevos entran al cuadro. Sin un gesto identico, la diferencia
// que se mide es la del dedo, no la del codigo.
//
// Lo que se lee es `dumpsys gfxinfo`, o sea lo que de verdad dibujo el
// compositor de Android. No es lo mismo que medir JavaScript: un p95 alto con
// pocas long tasks apunta al pintado (demasiados nodos, demasiadas capas), y al
// reves apunta al hilo principal. Para esa otra mitad esta utils/medirFluidez.js.
//
// Uso:
//   1. Abrir la app en el telefono y dejarla EN EL MAPA, con una UL cargada,
//      en la capa y al zoom que se quiere medir.
//   2. CERRAR el panel lateral (el boton de la navbar que lo repliega).
//   3. node scripts/medirMapa.mjs --etiqueta "antes, satelital z16"
//
// El paso 2 no es opcional en un telefono angosto. El A36 tiene 1080 px
// fisicos a densidad 450, o sea 384 px de viewport CSS, y el panel lateral
// mide 250: con el panel abierto al mapa le quedan 134 px y el swipe termina
// sobre el panel. El script avisa si salen pocos frames, pero es mas rapido
// saberlo antes.
//
// El script no navega la app a proposito: automatizar el login y la seleccion
// de UL por coordenadas de pantalla se rompe con cualquier cambio de layout, y
// un medidor que se rompe solo es peor que no tenerlo.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

const PAQUETE = 'cl.mla.maule'
const esWindows = platform() === 'win32'
const adbExe = esWindows ? 'adb.exe' : 'adb'

/** Donde puede estar adb, en orden de preferencia. */
function buscarAdb() {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const posibles = [
    process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', adbExe),
    process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', adbExe),
    join(local, 'Android', 'Sdk', 'platform-tools', adbExe),
    join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', adbExe),
    join(homedir(), 'Android', 'Sdk', 'platform-tools', adbExe),
  ].filter(Boolean)

  for (const ruta of posibles) if (existsSync(ruta)) return ruta
  // Ultimo recurso: que este en el PATH.
  const r = spawnSync(adbExe, ['version'], { encoding: 'utf8' })
  return r.error ? null : adbExe
}

const adb = buscarAdb()
if (!adb) {
  console.error('No encontre adb. Instalalo con el SDK de Android o apunta ANDROID_HOME a el.')
  process.exit(1)
}

// Argumentos en array y sin shell: asi una ruta con espacios no necesita
// comillas, que es justo lo que rompe este tipo de script en Windows.
function correr(args, { silencioso = false } = {}) {
  const r = spawnSync(adb, args, { encoding: 'utf8' })
  if (r.error) {
    console.error('No se pudo ejecutar adb: ' + r.error.message)
    process.exit(1)
  }
  if (r.status !== 0 && !silencioso) {
    console.error('adb ' + args.join(' ') + ' fallo:\n' + (r.stderr || r.stdout))
    process.exit(1)
  }
  return r.stdout ?? ''
}

// ------------------------------------------------------------- comprobaciones

const dispositivos = correr(['devices'])
  .split('\n').slice(1)
  .map((l) => l.trim()).filter(Boolean)
  .map((l) => l.split(/\s+/))

if (!dispositivos.length) {
  console.error('No hay ningun telefono conectado (adb devices esta vacio).')
  process.exit(1)
}

const sinAutorizar = dispositivos.find((d) => d[1] === 'unauthorized')
if (sinAutorizar) {
  console.error(
    'El telefono ' + sinAutorizar[0] + ' esta "unauthorized".\n' +
    'Acepta en la pantalla del telefono el dialogo "Permitir depuracion por USB"\n' +
    '(marcando "Permitir siempre desde este equipo") y volve a correr esto.'
  )
  process.exit(1)
}

if (!correr(['shell', 'pm', 'list', 'packages', PAQUETE]).includes(PAQUETE)) {
  console.error(PAQUETE + ' no esta instalado. Compila e instala primero:\n  npm run android:apk')
  process.exit(1)
}

// Que la app este ADELANTE importa: gfxinfo solo cuenta los frames que dibujo
// este paquete, asi que medir con la app en segundo plano da una tabla vacia
// o, peor, los pocos frames de otra pantalla.
const foco = correr(['shell', 'dumpsys', 'activity', 'activities'], { silencioso: true })
if (foco && !foco.includes(PAQUETE)) {
  console.error('Parece que ' + PAQUETE + ' no esta en pantalla. Abrila y dejala en el mapa.')
  process.exit(1)
}

// ----------------------------------------------------------------- argumentos

const args = process.argv.slice(2)
function valor(nombre, pordefecto) {
  const i = args.indexOf(nombre)
  return i >= 0 && args[i + 1] ? args[i + 1] : pordefecto
}
const etiqueta = valor('--etiqueta', 'sin etiqueta')
const repeticiones = Number(valor('--repeticiones', '12'))
const conZoom = args.includes('--zoom')

// -------------------------------------------------------------------- el gesto

const tamano = correr(['shell', 'wm', 'size'])
const medida = tamano.match(/(\d+)x(\d+)/)
if (!medida) {
  console.error('No pude leer el tamano de pantalla:\n' + tamano)
  process.exit(1)
}
const ancho = Number(medida[1])
const alto = Number(medida[2])

// El arrastre va por el medio vertical y cruza el 60 % del ancho. Se queda
// lejos de los bordes a proposito: arriba estan la navbar y el buscador, y a la
// izquierda el panel lateral — un swipe que empiece ahi no mueve el mapa, mueve
// el panel, y la medicion saldria limpia por el motivo equivocado.
const x1 = Math.round(ancho * 0.80)
const x2 = Math.round(ancho * 0.20)
const y = Math.round(alto * 0.55)

// 400 ms es un arrastre de verdad: lo bastante rapido para pedirle frames al
// compositor y lo bastante lento para que Leaflet alcance a reaccionar.
const DURACION_MS = 400

console.log('adb: ' + adb)
console.log(
  'pantalla: ' + ancho + 'x' + alto +
  ' · gesto: swipe ' + x1 + '->' + x2 + ' en y=' + y +
  ', ' + repeticiones + 'x' + (conZoom ? ' + zoom' : '')
)
console.log('OJO: el panel lateral tiene que estar CERRADO, o el swipe cae sobre el.')
console.log('midiendo, no toques el telefono...\n')

correr(['shell', 'dumpsys', 'gfxinfo', PAQUETE, 'reset'])

for (let i = 0; i < repeticiones; i++) {
  // Ida y vuelta, para terminar donde empezo: asi dos corridas seguidas miden
  // la misma zona y no se van desplazando por el mapa.
  correr(['shell', 'input', 'swipe', String(x1), String(y), String(x2), String(y), String(DURACION_MS)])
  correr(['shell', 'input', 'swipe', String(x2), String(y), String(x1), String(y), String(DURACION_MS)])

  if (conZoom) {
    // Doble toque = zoom in de Leaflet (doubleClickZoom, activo por defecto).
    // `input swipe` es de un solo dedo, asi que no puede hacer un pinch.
    const cx = Math.round(ancho * 0.5)
    correr(['shell', 'input', 'tap', String(cx), String(y)])
    correr(['shell', 'input', 'tap', String(cx), String(y)])
  }
}

// gfxinfo se lee DESPUES del gesto, pero los frames del ultimo arrastre siguen
// entrando un momento: sin esta pausa quedan a medio contar.
await new Promise((r) => setTimeout(r, 1500))

// ------------------------------------------------------------------ resultado

const salida = correr(['shell', 'dumpsys', 'gfxinfo', PAQUETE])

function num(patron) {
  const r = salida.match(patron)
  return r ? Number(r[1]) : null
}

const datos = {
  frames: num(/Total frames rendered:\s*(\d+)/),
  janky: num(/Janky frames:\s*(\d+)/),
  janky_pct: num(/Janky frames:\s*\d+\s*\(([\d.]+)%\)/),
  p50_ms: num(/50th percentile:\s*(\d+)ms/),
  p90_ms: num(/90th percentile:\s*(\d+)ms/),
  p95_ms: num(/95th percentile:\s*(\d+)ms/),
  p99_ms: num(/99th percentile:\s*(\d+)ms/),
  vsync_perdidos: num(/Number Missed Vsync:\s*(\d+)/),
  input_lento: num(/Number High input latency:\s*(\d+)/),
}

if (datos.frames == null) {
  console.error('gfxinfo no devolvio estadisticas. Salida cruda:\n')
  console.error(salida.slice(0, 2000))
  process.exit(1)
}
if (datos.frames < 20) {
  console.error(
    'Solo ' + datos.frames + ' frames: el gesto no movio el mapa.\n' +
    'Revisa que la app este en el mapa y que el swipe no caiga sobre el panel lateral.'
  )
  process.exit(1)
}

console.log('--- ' + etiqueta + ' ---')
console.table(datos)
console.log('\nFila para la tabla del README:\n')
console.log('| Escenario | Frames | Janky | p50 | p90 | p95 | p99 |')
console.log('|---|---|---|---|---|---|---|')
console.log(
  '| ' + etiqueta + ' | ' + datos.frames + ' | ' + datos.janky + ' (' + datos.janky_pct + ' %) | ' +
  datos.p50_ms + ' ms | ' + datos.p90_ms + ' ms | ' + datos.p95_ms + ' ms | ' + datos.p99_ms + ' ms |'
)
console.log(
  '\nLo que importa es el p95 y los janky, no el p50: el promedio esconde\n' +
  'justamente los saltos que se sienten.'
)

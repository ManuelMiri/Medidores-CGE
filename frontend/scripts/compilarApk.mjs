// Compila el APK de debug buscando por su cuenta un JDK que le sirva a Gradle.
//
// Por que existe: Capacitor 8 compila con source release 21, pero el java del
// PATH en esta maquina es un 17, y Gradle usa el del PATH salvo que se le diga
// otra cosa. El sintoma es "error: invalid source release: 21" en
// :capacitor-android:compileDebugJavaWithJavac, que no dice nada sobre JDKs.
//
// Se resuelve aca y no en gradle.properties porque org.gradle.java.home
// hardcodearia una ruta de ESTA maquina en un archivo versionado, y el colega
// que compile en otro equipo lo tendria roto al reves.
//
// Tambien evita el enredo de shells: se invoca gradlew por ruta absoluta, asi
// que no importa si npm corre el script en cmd, PowerShell o Git Bash.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MINIMO = 21

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const carpetaAndroid = join(raiz, 'android')
const esWindows = platform() === 'win32'

/** Subcarpetas directas de `base`, o [] si no existe. */
function hijos(base) {
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(base, d.name))
  } catch {
    return []
  }
}

function candidatos() {
  const lista = []
  if (process.env.JAVA_HOME) lista.push(process.env.JAVA_HOME)
  lista.push(...hijos(join(homedir(), '.jdks'))) // las que baja IntelliJ/Studio

  if (esWindows) {
    const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
    lista.push(
      join(pf, 'Android', 'Android Studio', 'jbr'),
      join(pf, 'Android', 'Android Studio Preview', 'jbr'),
      join(local, 'Programs', 'Android Studio', 'jbr'),
      ...hijos(join(pf, 'Java')),
      ...hijos(join(pf, 'Eclipse Adoptium')),
      ...hijos(join(pf, 'Microsoft'))
    )
  } else if (platform() === 'darwin') {
    lista.push(
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
      ...hijos('/Library/Java/JavaVirtualMachines').map((d) => join(d, 'Contents', 'Home'))
    )
  } else {
    lista.push('/opt/android-studio/jbr', ...hijos('/usr/lib/jvm'))
  }
  return lista
}

/** Version mayor del JDK instalado en `ruta`, o 0 si ahi no hay un java usable. */
function versionDe(ruta) {
  const java = join(ruta, 'bin', esWindows ? 'java.exe' : 'java')
  if (!existsSync(java)) return 0
  const r = spawnSync(java, ['-version'], { encoding: 'utf8' })
  // java -version escribe en stderr, no en stdout.
  const m = /version "(\d+)/.exec(`${r.stderr ?? ''}${r.stdout ?? ''}`)
  return m ? Number(m[1]) : 0
}

function buscarJdk() {
  const vistos = new Set()
  for (const ruta of candidatos()) {
    if (!ruta || vistos.has(ruta)) continue
    vistos.add(ruta)
    const v = versionDe(ruta)
    if (v >= MINIMO) return { ruta, version: v }
  }
  return null
}

const jdk = buscarJdk()
if (!jdk) {
  console.error(
    `\nNo se encontro ningun JDK ${MINIMO} o mayor, y Capacitor 8 no compila con menos.\n\n` +
      'El mas simple de conseguir es el que trae Android Studio (carpeta jbr).\n' +
      'Si ya tenes uno en otra parte, apuntalo con JAVA_HOME y volve a correr esto:\n' +
      (esWindows
        ? '  $env:JAVA_HOME = "C:\\ruta\\al\\jdk21"   # PowerShell\n'
        : '  export JAVA_HOME=/ruta/al/jdk21\n')
  )
  process.exit(1)
}

console.log(`JDK ${jdk.version}: ${jdk.ruta}`)

const gradlew = join(carpetaAndroid, esWindows ? 'gradlew.bat' : 'gradlew')
const r = spawnSync(esWindows ? `"${gradlew}"` : gradlew, ['assembleDebug'], {
  cwd: carpetaAndroid,
  stdio: 'inherit',
  env: { ...process.env, JAVA_HOME: jdk.ruta },
  // Un .bat necesita shell en Windows; en el resto se ejecuta directo.
  shell: esWindows,
})

if (r.error) {
  console.error(`\nNo se pudo ejecutar ${gradlew}: ${r.error.message}`)
  process.exit(1)
}
process.exit(r.status ?? 1)

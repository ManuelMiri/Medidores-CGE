// avisoWebView.js
// Avisar cuando el teléfono tiene un Android System WebView con el que TOES no
// sincroniza.
//
// Caso real (2026-10-16): con el WebView 155, TOES deja de sincronizar ("No se
// pudo establecer la conexión"); sus consultas salen sin cookies y el servidor
// contesta 403. Con la 154 y la de fábrica (134) funciona. Google reinstala la
// 155 cada vez que se usa Chrome o Maps, y el lector tiene que bajarla a mano.
// Lo que cuesta caro es el orden: si TOES alcanza a abrirse con la 155 y
// guarda lecturas, bajar de versión las borra. Por eso el aviso dice qué hacer
// ANTES de abrir TOES.
//
// Esta app corre en el mismo WebView del sistema que TOES, así que la versión
// que ve en su user agent es la que va a usar TOES.
//
// Si una versión posterior vuelve a andar, agregarle un tope a la regla en vez
// de bajar PRIMERA_SIN_SINCRONIZAR: la 155 sigue rota.

export const PRIMERA_SIN_SINCRONIZAR = 155

/** La versión mayor del WebView según el user agent ("Chrome/134.0…" → 134). */
export function versionWebView(userAgent) {
  const m = /Chrome\/(\d+)\./.exec(userAgent ?? '')
  return m ? Number(m[1]) : null
}

/**
 * El texto del aviso, o null si no hay nada que avisar.
 * Solo en el APK: en un navegador, la versión de Chrome no dice nada del
 * WebView que usa TOES.
 */
export function avisoWebView(userAgent, esApk) {
  if (!esApk) return null
  const version = versionWebView(userAgent)
  if (version === null || version < PRIMERA_SIN_SINCRONIZAR) return null
  return `Este teléfono tiene el WebView ${version}: con él TOES no sincroniza. ` +
    'Antes de abrir TOES, desinstala las actualizaciones de "Android System WebView" (Ajustes → Aplicaciones). ' +
    'Si TOES ya tiene lecturas sin enviar, avisa antes de hacerlo: al bajarlo se pierden.'
}

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { avisoWebView, versionWebView } from './avisoWebView.js'

// User agents de un WebView de Android (con "; wv)"), como los ve la app.
const ua = (version) =>
  `Mozilla/5.0 (Linux; Android 16; SM-A366B Build/BP2A.250605.031.A3; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/${version} Mobile Safari/537.36`

describe('versionWebView', () => {
  test('saca la versión mayor', () => {
    assert.equal(versionWebView(ua('134.0.6998.135')), 134)
    assert.equal(versionWebView(ua('155.0.7341.12')), 155)
  })

  test('sin Chrome en el user agent no inventa una versión', () => {
    assert.equal(versionWebView('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'), null)
    assert.equal(versionWebView(undefined), null)
  })
})

describe('avisoWebView', () => {
  test('la de fábrica (134) y la 154 andan con TOES: no avisa', () => {
    assert.equal(avisoWebView(ua('134.0.6998.135'), true), null)
    assert.equal(avisoWebView(ua('154.0.8037.107'), true), null)
  })

  test('con la 155 avisa, con la versión y qué hacer antes de abrir TOES', () => {
    const texto = avisoWebView(ua('155.0.7341.12'), true)
    assert.match(texto, /WebView 155/)
    assert.match(texto, /Antes de abrir TOES/)
    assert.match(texto, /Android System WebView/)
  })

  test('una más nueva también, hasta saber que se arregló', () => {
    assert.match(avisoWebView(ua('157.0.1.1'), true), /WebView 157/)
  })

  test('en el navegador no avisa: Chrome 155 no es el WebView de TOES', () => {
    assert.equal(avisoWebView(ua('155.0.7341.12'), false), null)
  })

  test('sin versión reconocible no avisa', () => {
    assert.equal(avisoWebView('algo raro', true), null)
  })
})

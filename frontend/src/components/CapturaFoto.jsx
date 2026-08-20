// src/components/CapturaFoto.jsx
// Le permite a un técnico sacarle una foto a un medidor desde el celular
// (usando la cámara directo, sin galería) y la sube junto con un nombre
// y las coordenadas GPS de dónde estaba parado en ese momento.
import { useState, useRef } from 'react'
import { Spinner } from 'react-bootstrap'
import api from '../services/api'

export default function CapturaFoto({ instalacion, fotosExistentes = [], onFotoSubida }) {
  const inputRef = useRef(null)
  const [archivo, setArchivo] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [nombre, setNombre] = useState('')
  const [coordenadas, setCoordenadas] = useState(null)
  const [buscandoUbicacion, setBuscandoUbicacion] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)

  // Al elegir/tomar la foto, pido la ubicación GPS al toque — así el
  // técnico no tiene que acordarse de nada, queda todo listo para subir.
  function handleArchivo(e) {
    const file = e.target.files[0]
    if (!file) return

    setArchivo(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError(null)
    pedirUbicacion()
  }

  function pedirUbicacion() {
    if (!navigator.geolocation) {
      setError('Este dispositivo no soporta geolocalización')
      return
    }
    setBuscandoUbicacion(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoordenadas({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setBuscandoUbicacion(false)
      },
      () => {
        setError('No se pudo obtener tu ubicación. Actívala e inténtalo de nuevo.')
        setBuscandoUbicacion(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function cancelar() {
    setArchivo(null)
    setPreviewUrl(null)
    setNombre('')
    setCoordenadas(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSubir() {
    if (!nombre.trim()) {
      setError('Ponle un nombre a la foto')
      return
    }
    if (!coordenadas) {
      setError('Todavía no tengo tu ubicación, espera un momento e inténtalo de nuevo')
      return
    }

    setSubiendo(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('foto', archivo)
      formData.append('nombre', nombre.trim())
      formData.append('lat', coordenadas.lat)
      formData.append('lng', coordenadas.lng)

      const { data } = await api.post(`/medidores/${instalacion}/fotos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      cancelar()
      onFotoSubida?.(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al subir la foto')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="mt-2">
      <label style={{ fontSize: '0.8rem', fontWeight: '600' }}>📷 Fotos</label>

      {fotosExistentes.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {fotosExistentes.map((foto, i) => (
            <a key={i} href={foto.url} target="_blank" rel="noreferrer" title={foto.nombre}>
              <img
                src={foto.url}
                alt={foto.nombre}
                style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }}
              />
            </a>
          ))}
        </div>
      )}

      {error && <div className="alert alert-danger py-1 px-2 mb-2" style={{ fontSize: '0.78rem' }}>{error}</div>}

      {!archivo ? (
        <>
          {/* El input real queda oculto — lo disparamos con el botón de
              abajo para poder ponerle un ícono, en vez del botón feo que
              el navegador pone por defecto. */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleArchivo}
          />
          <button
            className="btn btn-outline-primary btn-sm w-100"
            onClick={() => inputRef.current?.click()}
          >
            📷 Tomar foto
          </button>
        </>
      ) : (
        <div className="border rounded p-2">
          <img src={previewUrl} alt="preview" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 4 }} />

          <input
            className="form-control form-control-sm mt-2"
            placeholder="Nombre de la foto (ej: Poste frontal)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />

          <div style={{ fontSize: '0.75rem' }} className="text-muted mt-1">
            {buscandoUbicacion && <><Spinner size="sm" /> Obteniendo tu ubicación…</>}
            {coordenadas && `📍 ${coordenadas.lat.toFixed(5)}, ${coordenadas.lng.toFixed(5)}`}
          </div>

          <div className="d-flex gap-2 mt-2">
            <button className="btn btn-outline-secondary btn-sm flex-fill" onClick={cancelar} disabled={subiendo}>
              Cancelar
            </button>
            <button
              className="btn btn-primary btn-sm flex-fill"
              onClick={handleSubir}
              disabled={subiendo || buscandoUbicacion || !coordenadas}
            >
              {subiendo ? <Spinner size="sm" /> : '⬆️ Subir foto'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
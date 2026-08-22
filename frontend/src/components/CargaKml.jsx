// src/components/CargaKml.jsx
// Botón + modal para que el admin suba la ruta de un lector — KML de
// Google My Maps o Excel exportado de SAP, el backend detecta cuál es
// solo). Este componente SÍ habla con la API (preview y confirmar) y le
// pasa los datos ya listos a PreviewImportacion, que solo se encarga de
// mostrarlos.
import { useState } from 'react'
import { Modal, Spinner } from 'react-bootstrap'
import api from '../services/api'
import PreviewImportacion from './PreviewImportacion'

export default function CargaKml({ onImportado }) {
  const [modalAbierto, setModalAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resumen, setResumen] = useState(null)
  const [error, setError] = useState(null)

  function abrir() {
    setModalAbierto(true)
    setResumen(null)
    setError(null)
  }

  function cerrar() {
    setModalAbierto(false)
    setResumen(null)
    setError(null)
  }

  async function handleArchivo(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    setCargando(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('archivo', archivo)
      const { data } = await api.post('/importacion/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResumen(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al leer el archivo')
    } finally {
      setCargando(false)
      e.target.value = '' // permite volver a elegir el mismo archivo si falla
    }
  }

  async function handleConfirmar() {
    setConfirmando(true)
    setError(null)
    try {
      await api.post('/importacion/confirmar', { medidores: resumen.nuevos })
      cerrar()
      onImportado?.() // el padre recarga medidores (y ULs, por si aparece una nueva)
    } catch (err) {
      setError(err.response?.data?.error || 'Error al importar')
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <>
      <button className="btn btn-outline-primary btn-sm w-100" onClick={abrir}>
        📤 Importar ruta
      </button>

      <Modal show={modalAbierto} onHide={cerrar} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Importar medidores de una ruta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger py-2" style={{ fontSize: '0.85rem' }}>{error}</div>}

          {!resumen && (
            <>
              <label style={{ fontSize: '0.85rem' }}>
                Selecciona el archivo de la ruta: el .kml de Google My Maps
                o el Excel (.xlsx) que descarga la analista desde SAP.
              </label>
              <input
                type="file"
                accept=".kml,.xlsx,.xls,application/vnd.google-earth.kml+xml,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="form-control form-control-sm mt-2"
                onChange={handleArchivo}
                disabled={cargando}
              />
              {cargando && (
                <div className="text-center mt-3">
                  <Spinner size="sm" /> Leyendo archivo…
                </div>
              )}
            </>
          )}

          {resumen && (
            <PreviewImportacion
              resumen={resumen}
              confirmando={confirmando}
              onConfirmar={handleConfirmar}
              onCancelar={cerrar}
            />
          )}
        </Modal.Body>
      </Modal>
    </>
  )
}
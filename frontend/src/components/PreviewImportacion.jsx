// src/components/PreviewImportacion.jsx
// Componente "tonto": solo muestra la lista de medidores nuevos que
// detectó el preview del KML. No sabe nada de axios ni de la API — recibe
// los datos y avisa hacia arriba cuando el usuario confirma o cancela.
// Lo separo de CargaKml.jsx para que si el día de mañana cambia cómo se
// ve la tabla, no haya que tocar la lógica de subida del archivo.
export default function PreviewImportacion({ resumen, confirmando, onConfirmar, onCancelar }) {
  return (
    <div>
      <p style={{ fontSize: '0.85rem' }}>
        El KML trae <strong>{resumen.totalEnKml}</strong> medidores en total.{' '}
        <strong>{resumen.totalExistentes}</strong> ya estaban registrados (no se tocan) y{' '}
        <strong style={{ color: '#276749' }}>{resumen.totalNuevos}</strong> son nuevos.
      </p>

      {resumen.nuevos.length === 0 ? (
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          No hay medidores nuevos que importar en esta ruta.
        </p>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="table table-sm" style={{ fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th>Instalación</th>
                <th>Dirección</th>
                <th>UL</th>
              </tr>
            </thead>
            <tbody>
              {resumen.nuevos.map((m) => (
                <tr key={m.instalacion}>
                  <td>{m.instalacion}</td>
                  <td>{m.direccion || '—'}</td>
                  <td>{m.unidadDeLectura || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="d-flex gap-2 mt-3">
        <button className="btn btn-outline-secondary btn-sm flex-fill" onClick={onCancelar} disabled={confirmando}>
          Cancelar
        </button>
        <button
          className="btn btn-success btn-sm flex-fill"
          onClick={onConfirmar}
          disabled={confirmando || resumen.nuevos.length === 0}
        >
          {confirmando ? 'Importando…' : `✅ Confirmar importación (${resumen.nuevos.length})`}
        </button>
      </div>
    </div>
  )
}
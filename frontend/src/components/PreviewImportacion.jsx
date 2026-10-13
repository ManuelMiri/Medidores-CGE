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

      {/* El archivo de origen puede traer la misma instalación más de una vez.
          Se importa una sola. Si la repetida trae otra serie es el medidor
          lupa (el del poste) y se guarda con el servicio; si trae una tercera,
          esa sí queda afuera y hay que decirlo. */}
      {resumen.repetidos?.length > 0 && (
        <div className="alert alert-warning py-1 px-2" style={{ fontSize: '0.78rem' }}>
          El archivo traía {resumen.totalFilas} filas con instalaciones repetidas; se importa
          una por instalación.
          {resumen.repetidos.some((r) => r.lupa) && (
            <div className="mt-1" style={{ color: '#9b2c2c' }}>
              Con medidor lupa (se guarda junto al de la casa):
              {resumen.repetidos.filter((r) => r.lupa).map((r) => (
                <div key={r.instalacion}>
                  <strong>{r.instalacion}</strong>: lupa serie {r.lupa}
                  {r.otrosMedidores?.length > 0 && ` · quedan afuera: ${r.otrosMedidores.join(', ')}`}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {resumen.lupasNuevas?.length > 0 && (
        <p style={{ fontSize: '0.8rem' }}>
          Además se agrega el medidor lupa a <strong>{resumen.lupasNuevas.length}</strong>{' '}
          servicio(s) que ya estaban registrados (no se toca nada más).
        </p>
      )}

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
          disabled={confirmando || (resumen.nuevos.length === 0 && !(resumen.lupasNuevas?.length > 0))}
        >
          {confirmando ? 'Importando…' : `✅ Confirmar importación (${resumen.nuevos.length})`}
        </button>
      </div>
    </div>
  )
}
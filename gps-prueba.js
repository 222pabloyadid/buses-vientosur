const ubicaciones = new Map();

function guardar(id, latitud, longitud) {
  ubicaciones.set(String(id), {
    latitud,
    longitud,
    actualizado: Date.now()
  });
}

function detener(id) {
  ubicaciones.delete(String(id));
}

function listar() {
  const ahora = Date.now();
  const resultado = [];

  for (const [id, dato] of ubicaciones) {
    if (ahora - dato.actualizado > 600000) {
      ubicaciones.delete(id);
      continue;
    }

    resultado.push({
      conductor_id: id,
      latitud: dato.latitud,
      longitud: dato.longitud,
      gps_actualizado_at:
        new Date(dato.actualizado).toISOString()
    });
  }

  return resultado;
}

module.exports = { guardar, detener, listar };

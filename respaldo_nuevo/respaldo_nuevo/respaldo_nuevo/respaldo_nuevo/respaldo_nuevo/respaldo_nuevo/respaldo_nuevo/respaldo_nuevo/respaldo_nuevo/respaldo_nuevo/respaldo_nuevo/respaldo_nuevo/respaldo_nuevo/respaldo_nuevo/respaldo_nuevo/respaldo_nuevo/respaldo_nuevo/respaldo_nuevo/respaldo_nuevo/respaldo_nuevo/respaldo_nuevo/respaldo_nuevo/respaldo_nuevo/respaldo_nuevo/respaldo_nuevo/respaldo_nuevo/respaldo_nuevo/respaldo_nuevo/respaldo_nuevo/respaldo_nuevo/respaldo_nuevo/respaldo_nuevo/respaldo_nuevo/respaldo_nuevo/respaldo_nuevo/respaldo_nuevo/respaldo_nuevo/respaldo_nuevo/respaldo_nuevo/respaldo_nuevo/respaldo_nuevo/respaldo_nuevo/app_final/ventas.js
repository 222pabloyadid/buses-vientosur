const fs = require("fs");
const path = require("path");

const archivo = path.join(__dirname, "ventas.json");

// leer ventas
function leerVentas() {
  if (!fs.existsSync(archivo)) return [];
  const data = fs.readFileSync(archivo, "utf8");
  return JSON.parse(data || "[]");
}

// guardar venta
function guardarVenta(fecha, hora, asiento) {
  const ventas = leerVentas();
  ventas.push({ fecha, hora, asiento });

  fs.writeFileSync(archivo, JSON.stringify(ventas, null, 2));
}

// obtener ocupados
function obtenerAsientosOcupados(fecha, hora) {
  const ventas = leerVentas();

  return ventas
    .filter(v => v.fecha === fecha && v.hora === hora)
    .map(v => v.asiento);
}

module.exports = {
  guardarVenta,
  obtenerAsientosOcupados
};

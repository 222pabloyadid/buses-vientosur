function filtrarPorTiempo(resultado, fecha) {
  if (!fecha) return resultado;

  const ahora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Santiago" })
  );
  const hoy = ahora.toLocaleDateString("sv-SE");

  if (fecha !== hoy) return resultado;

  return resultado.filter(h => {
    const horaStr = typeof h === "string" ? h : h.hora;

    const [h2, m] = horaStr.split(":");

    const salida = new Date(ahora);
    salida.setHours(parseInt(h2), parseInt(m), 0, 0);

    salida.setMinutes(salida.getMinutes() - 10);

    return ahora < salida;
  });
}

module.exports = filtrarPorTiempo;

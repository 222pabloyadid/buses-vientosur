function normalizarRut(valor) {
  return String(valor || "")
    .replace(/[.\-\s]/g, "")
    .toUpperCase();
}

function rutValido(rut) {
  if (!/^\d{7,8}[\dK]$/.test(rut)) return false;

  let suma = 0;
  let factor = 2;

  for (let i = rut.length - 2; i >= 0; i--) {
    suma += Number(rut[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const resto = 11 - suma % 11;
  const dv = resto === 11 ? "0" :
             resto === 10 ? "K" : String(resto);

  return rut.slice(-1) === dv;
}

function normalizarLugar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function fechaChile() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const obtener = tipo =>
    partes.find(p => p.type === tipo).value;

  return obtener("year") + "-" + obtener("month") + "-" + obtener("day");
}

async function validarEstudiante(supabase, rutIngresado, origen, destino) {
  const rut = normalizarRut(rutIngresado);

  if (!rutValido(rut)) {
    throw new Error("RUT inválido.");
  }

  const { data, error } = await supabase
    .from("estudiantes_vientosur")
    .select("rut,origen,destino,precio_estudiante,vencimiento,estado")
    .eq("rut", rut)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error("Pase escolar no registrado.");
  }

  if (data.estado !== "activo") {
    throw new Error("Pase escolar no habilitado.");
  }

  if (data.vencimiento < fechaChile()) {
    throw new Error("Pase escolar vencido.");
  }

  const precio = Number(data.precio_estudiante);

  if (!Number.isSafeInteger(precio) || precio <= 0) {
    throw new Error("Tarifa estudiantil no configurada.");
  }

  const a = normalizarLugar(data.origen);
  const b = normalizarLugar(data.destino);

  if (origen !== undefined || destino !== undefined) {
    const x = normalizarLugar(origen);
    const y = normalizarLugar(destino);

    if (!(
      (x === a && y === b) ||
      (x === b && y === a)
    )) {
      throw new Error("Ruta no autorizada para este pase.");
    }
  }

  return {
    rut: data.rut,
    origen: data.origen,
    destino: data.destino,
    precio,
    vencimiento: data.vencimiento
  };
}

module.exports = {
  validarEstudiante,
  normalizarRut,
  rutValido
};

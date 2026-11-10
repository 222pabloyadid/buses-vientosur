async function calcularLlegadaBus(bus, pasajero) {
  try {
    const valores = [
      bus.latitud,
      bus.longitud,
      pasajero.latitud,
      pasajero.longitud
    ].map(Number);

    if (valores.some(v => !Number.isFinite(v))) {
      return {
        ok: false,
        mensaje: "Ubicacion GPS no disponible"
      };
    }

    const [latBus, lonBus, latPas, lonPas] = valores;

    if (
      Math.abs(latBus) > 90 ||
      Math.abs(latPas) > 90 ||
      Math.abs(lonBus) > 180 ||
      Math.abs(lonPas) > 180
    ) {
      return {
        ok: false,
        mensaje: "Coordenadas GPS invalidas"
      };
    }

    const servidor = process.env.OSRM_URL;

    if (!servidor) {
      return {
        ok: false,
        mensaje: "Calculo por carretera no configurado"
      };
    }

    const url = new URL(
      "/route/v1/driving/" +
      lonBus + "," + latBus + ";" +
      lonPas + "," + latPas,
      servidor
    );

    url.searchParams.set("overview", "false");
    url.searchParams.set("steps", "false");

    const respuesta = await fetch(url, {
      signal: AbortSignal.timeout(8000)
    });

    if (!respuesta.ok) {
      throw new Error("Servicio de rutas no disponible");
    }

    const datos = await respuesta.json();
    const ruta = datos.routes?.[0];

    if (
      datos.code !== "Ok" ||
      !ruta ||
      !Number.isFinite(ruta.duration) ||
      !Number.isFinite(ruta.distance)
    ) {
      throw new Error("No existe una ruta valida");
    }

    return {
      ok: true,
      minutos_por_carretera: Math.ceil(ruta.duration / 60),
      distancia_km: Number((ruta.distance / 1000).toFixed(1)),
      direccion_confirmada: false,
      mensaje: "Falta verificar si el bus ya paso por el pasajero"
    };

  } catch (error) {
    return {
      ok: false,
      mensaje: "No se pudo calcular la ruta por carretera"
    };
  }
}

module.exports = { calcularLlegadaBus };

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

function crearRutasConductores(supabase) {
  const router = express.Router();
  const sesiones = new Map();

  router.post("/login", async (req, res) => {
    try {
      const { usuario, password } = req.body || {};

      if (
        typeof usuario !== "string" ||
        typeof password !== "string" ||
        !usuario.trim() ||
        !password ||
        usuario.length > 100 ||
        password.length > 128
      ) {
        return res.status(400).json({
          ok: false,
          mensaje: "Datos inválidos"
        });
      }

      const { data: conductor, error } = await supabase
        .from("conductores")
        .select("id,nombre,usuario,clave_hash,activo")
        .eq("usuario", usuario.trim())
        .maybeSingle();

      if (error) throw error;

      const valido = conductor?.activo
        ? await bcrypt.compare(password, conductor.clave_hash)
        : false;

      if (!valido) {
        return res.status(401).json({
          ok: false,
          mensaje: "Credenciales incorrectas"
        });
      }

      const token = crypto.randomBytes(32).toString("hex");

      sesiones.set(token, {
        conductor_id: conductor.id,
        expira: Date.now() + 12 * 60 * 60 * 1000
      });

      res.json({
        ok: true,
        token,
        conductor: {
          id: conductor.id,
          nombre: conductor.nombre
        }
      });

    } catch (error) {
      console.error("ERROR LOGIN CONDUCTOR:", error);
      res.status(500).json({
        ok: false,
        mensaje: "Error al ingresar"
      });
    }
  });

  router.get("/yo", async (req, res) => {
    const token = (req.headers.authorization || "")
      .replace(/^Bearer /, "");

    const sesion = sesiones.get(token);

    if (!sesion || sesion.expira < Date.now()) {
      return res.status(401).json({ ok: false });
    }

    const { data: conductor, error } = await supabase
      .from("conductores")
      .select("id,nombre,activo")
      .eq("id", sesion.conductor_id)
      .maybeSingle();

    if (error || !conductor?.activo) {
      sesiones.delete(token);
      return res.status(401).json({ ok: false });
    }

    res.json({
      ok: true,
      conductor
    });
  });


  // Horarios habilitados para los conductores
  router.get("/horarios", async (req, res) => {
    try {
      const token = (req.headers.authorization || "")
        .replace(/^Bearer /, "");

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({ ok: false });
      }

      const { data: conductor, error: errorConductor } =
        await supabase
          .from("conductores")
          .select("activo")
          .eq("id", sesion.conductor_id)
          .maybeSingle();

      if (errorConductor || !conductor?.activo) {
        return res.status(403).json({ ok: false });
      }

      const horarios = require("./horarios.js");

      const { data: bloqueos, error } = await supabase
        .from("horarios_bloqueados")
        .select("hora");

      if (error) throw error;

      const bloqueados = new Set(
        (bloqueos || []).map(x => x.hora)
      );

      const fechaChile = new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone: "America/Santiago",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }
      ).format(new Date());

      const diaSemana = new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: "America/Santiago",
          weekday: "long"
        }
      ).format(new Date());

      const tipo = diaSemana === "Saturday"
        ? "sabado"
        : diaSemana === "Sunday"
          ? "domingo"
          : "semana";

      const disponibles = {};

      for (const [ruta, horas] of Object.entries(
        horarios[tipo] || {}
      )) {
        const activas = horas.filter(
          h => !bloqueados.has(
            typeof h === "string" ? h : h.hora
          )
        );

        if (activas.length) {
          disponibles[ruta] = activas;
        }
      }

      res.json({
        ok: true,
        fecha: fechaChile,
        horarios: disponibles
      });

    } catch (error) {
      console.error("ERROR HORARIOS CONDUCTOR:", error);
      res.status(500).json({
        ok: false,
        mensaje: "No se pudieron cargar los horarios"
      });
    }
  });


  // Iniciar recorrido del conductor
  router.post("/iniciar", async (req, res) => {
    try {
      const token = (req.headers.authorization || "")
        .replace(/^Bearer /, "");

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({ ok: false });
      }

      const { ruta, hora } = req.body || {};

      const horarios = require("./horarios.js");

      const ahora = new Date();

      const fecha = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(ahora);

      const dia = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Santiago",
        weekday: "long"
      }).format(ahora);

      const tipo = dia === "Saturday"
        ? "sabado"
        : dia === "Sunday" ? "domingo" : "semana";

      const disponibles = horarios[tipo]?.[ruta] || [];

      if (!disponibles.some(h =>
        (typeof h === "string" ? h : h.hora) === hora
      )) {
        return res.status(400).json({
          ok: false,
          mensaje: "Horario no disponible"
        });
      }

      const { data: bloqueos, error: errorBloqueos } =
        await supabase
          .from("horarios_bloqueados")
          .select("hora")
          .eq("hora", hora);

      if (errorBloqueos) throw errorBloqueos;

      if (bloqueos?.length) {
        return res.status(400).json({
          ok: false,
          mensaje: "Horario deshabilitado"
        });
      }

      const { data: conductor, error: errorConductor } =
        await supabase
          .from("conductores")
          .select("activo")
          .eq("id", sesion.conductor_id)
          .maybeSingle();

      if (errorConductor || !conductor?.activo) {
        return res.status(403).json({ ok: false });
      }

      const partes = ruta.split("_");

      const { data, error } = await supabase
        .from("recorridos_conductor")
        .insert({
          conductor_id: sesion.conductor_id,
          fecha,
          hora,
          origen: partes[0],
          destino: partes.slice(1).join("_"),
          estado: "activo"
        })
        .select("id")
        .single();

      if (error) throw error;

      res.json({ ok: true, recorrido_id: data.id });

    } catch (error) {
      console.error("ERROR INICIANDO RECORRIDO:", error);
      res.status(500).json({
        ok: false,
        mensaje: "No se pudo iniciar el recorrido"
      });
    }
  });


  // Consultar recorrido activo
  router.get("/recorrido-activo", async (req, res) => {
    try {
      const token = (req.headers.authorization || "")
        .replace(/^Bearer /, "");
      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({ ok: false });
      }

      const { data, error } = await supabase
        .from("recorridos_conductor")
        .select("id,fecha,hora,origen,destino")
        .eq("conductor_id", sesion.conductor_id)
        .eq("estado", "activo")
        .maybeSingle();

      if (error) throw error;

      res.json({ ok: true, recorrido: data });
    } catch (error) {
      res.status(500).json({ ok: false });
    }
  });

  // Finalizar recorrido
  router.post("/finalizar", async (req, res) => {
    try {
      const token = (req.headers.authorization || "")
        .replace(/^Bearer /, "");
      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({ ok: false });
      }

      const { data, error } = await supabase
        .from("recorridos_conductor")
        .update({
          estado: "finalizado",
          finalizado_at: new Date().toISOString()
        })
        .eq("conductor_id", sesion.conductor_id)
        .eq("estado", "activo")
        .select("id");

      if (error) throw error;

      res.json({
        ok: true,
        finalizados: data.length
      });
    } catch (error) {
      res.status(500).json({ ok: false });
    }
  });


  // Validar boleto QR del pasajero
  router.post("/validar-qr", async (req, res) => {
    try {
      const authorization = req.headers.authorization || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesión vencida"
        });
      }

      const codigo = String(req.body?.codigo_qr || "").trim();
      const recorridoId = String(req.body?.recorrido_id || "").trim();

      if (!/^[a-f0-9]{48}$/i.test(codigo) ||
          !/^[a-f0-9-]{36}$/i.test(recorridoId)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Código QR o recorrido inválido"
        });
      }

      const { data: conductor, error: errorConductor } =
        await supabase
          .from("conductores")
          .select("activo")
          .eq("id", sesion.conductor_id)
          .maybeSingle();

      if (errorConductor) throw errorConductor;

      if (!conductor?.activo) {
        return res.status(403).json({
          ok: false,
          mensaje: "Conductor no habilitado"
        });
      }

      const { data, error } = await supabase.rpc(
        "validar_boleto_conductor",
        {
          p_codigo_qr: codigo,
          p_conductor_id: sesion.conductor_id,
          p_recorrido_id: recorridoId
        }
      );

      if (error) throw error;

      return res.json(data);

    } catch (error) {
      console.error("ERROR VALIDANDO QR:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo validar el boleto"
      });
    }
  });



  // Pasajes pagados del recorrido activo del conductor
  router.get("/pasajes-vendidos", async (req, res) => {
    try {
      const token = (req.headers.authorization || "")
        .replace(/^Bearer /, "").trim();

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesión vencida"
        });
      }

      const { data: recorrido, error: errorRecorrido } =
        await supabase
          .from("recorridos_conductor")
          .select("id,fecha,hora,origen,destino")
          .eq("conductor_id", sesion.conductor_id)
          .eq("estado", "activo")
          .maybeSingle();

      if (errorRecorrido) throw errorRecorrido;

      if (!recorrido) {
        return res.json({
          ok: true,
          pasajes: [],
          cantidad: 0,
          abordados: 0,
          total: 0
        });
      }

      const { data: ventas, error: errorVentas } =
        await supabase
          .from("ventas")
          .select("id,asiento,ruta,precio,estado,validado_at")
          .eq("fecha", recorrido.fecha)
          .eq("hora", recorrido.hora)
          .eq("estado", "pagado");

      if (errorVentas) throw errorVentas;

      const paradasTemucoTolten = [
        "Lolen", "Arauco", "Parada21", "LasDichas",
        "Limite", "BarrosArana", "Parada31",
        "TeodoroSchmidt", "Hualpin", "Tolten"
      ];

      const pasajes = (ventas || []).filter(venta => {
        const partes = String(venta.ruta || "").split(" - ");
        if (partes.length !== 2) return false;

        const [origen, destino] = partes;

        if (recorrido.origen === "Temuco" &&
            recorrido.destino === "Tolten") {
          return origen === "Temuco" &&
            paradasTemucoTolten.includes(destino);
        }

        return origen === recorrido.origen &&
          destino === recorrido.destino;
      }).map(venta => {
        const [sube, baja] = venta.ruta.split(" - ");

        return {
          id: venta.id,
          asiento: venta.asiento,
          sube,
          baja,
          precio: Number(venta.precio || 0),
          abordado: Boolean(venta.validado_at)
        };
      });

      pasajes.sort((a, b) =>
        Number(a.asiento) - Number(b.asiento)
      );

      res.set("Cache-Control", "no-store");

      return res.json({
        ok: true,
        recorrido,
        pasajes,
        cantidad: pasajes.length,
        abordados: pasajes.filter(p => p.abordado).length,
        total: pasajes.reduce((s, p) => s + p.precio, 0)
      });

    } catch (error) {
      console.error("ERROR PASAJES VENDIDOS:", error);

      return res.status(500).json({
        ok: false,
        mensaje: "No se pudieron consultar los pasajes"
      });
    }
  });


  // Registrar incidencia del recorrido activo
  router.post("/incidencia", async (req, res) => {
    try {
      const authorization = req.headers.authorization || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesión vencida"
        });
      }

      const motivo = String(req.body?.motivo || "");

      if (!["falla_mecanica", "accidente", "otra"].includes(motivo)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Motivo de incidencia inválido"
        });
      }

      const { data: conductor, error: errorConductor } =
        await supabase
          .from("conductores")
          .select("activo")
          .eq("id", sesion.conductor_id)
          .maybeSingle();

      if (errorConductor) throw errorConductor;

      if (!conductor?.activo) {
        return res.status(403).json({
          ok: false,
          mensaje: "Conductor no habilitado"
        });
      }

      const { data: recorrido, error: errorRecorrido } =
        await supabase
          .from("recorridos_conductor")
          .select("id")
          .eq("conductor_id", sesion.conductor_id)
          .eq("estado", "activo")
          .maybeSingle();

      if (errorRecorrido) throw errorRecorrido;

      if (!recorrido) {
        return res.status(400).json({
          ok: false,
          mensaje: "No tienes un recorrido activo"
        });
      }

      const { data, error } = await supabase
        .from("incidencias_conductor")
        .insert({
          recorrido_id: recorrido.id,
          conductor_id: sesion.conductor_id,
          motivo
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({
            ok: false,
            mensaje: "Este recorrido ya tiene una incidencia reportada"
          });
        }
        throw error;
      }

      // Asociar a la incidencia los boletos del recorrido afectado.
      const { data: recorridoAfectado, error: errorDatos } =
        await supabase
          .from("recorridos_conductor")
          .select("fecha,hora,origen,destino")
          .eq("id", recorrido.id)
          .single();

      if (errorDatos) throw errorDatos;

      const { data: ventasAfectadas, error: errorVentas } =
        await supabase
          .from("ventas")
          .select("id,ruta")
          .eq("fecha", recorridoAfectado.fecha)
          .eq("hora", recorridoAfectado.hora)
          .eq("estado", "pagado")
          .is("validado_at", null)
          .is("incidencia_id", null);

      if (errorVentas) throw errorVentas;

      const normalizar = texto =>
        String(texto || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

      const origen = normalizar(recorridoAfectado.origen);
      const destino = normalizar(recorridoAfectado.destino);

      const paradasTolten = new Set([
        "lolen", "arauco", "parada21", "lasdichas",
        "limite", "barrosarana", "parada31",
        "teodoroschmidt", "hualpin", "tolten"
      ]);

      const ids = (ventasAfectadas || [])
        .filter(venta => {
          const partes = String(venta.ruta || "").split(/\s+-\s+/);
          if (partes.length !== 2) return false;

          const salida = normalizar(partes[0]);
          const llegada = normalizar(partes[1]);

          if (origen === "temuco" && destino === "tolten") {
            return salida === "temuco" &&
              paradasTolten.has(llegada);
          }

          return salida === origen && llegada === destino;
        })
        .map(venta => venta.id);

      if (ids.length) {
        const { error: errorAsociacion } = await supabase
          .from("ventas")
          .update({ incidencia_id: data.id })
          .in("id", ids)
          .is("incidencia_id", null);

        if (errorAsociacion) throw errorAsociacion;
      }

      return res.json({
        ok: true,
        incidencia_id: data.id,
        boletos_afectados: ids.length,
        mensaje: "Incidencia registrada. Administración será informada."
      });

    } catch (error) {
      console.error("ERROR REGISTRANDO INCIDENCIA:", error);

      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo registrar la incidencia"
      });
    }
  });

  // Producción diaria del conductor
  router.get("/produccion", async (req, res) => {
    try {
      const authorization = req.headers.authorization || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesión vencida"
        });
      }

      const fechaChile = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());

      const { data, error } = await supabase
        .from("ventas")
        .select("precio,validado_at")
        .eq("validado_por", sesion.conductor_id)
        .not("validado_at", "is", null);

      if (error) throw error;

      const formato = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      });

      const boletos = (data || []).filter(
        venta => formato.format(new Date(venta.validado_at)) === fechaChile
      );

      const total = boletos.reduce(
        (suma, venta) => suma + Number(venta.precio || 0),
        0
      );

      return res.json({
        ok: true,
        fecha: fechaChile,
        cantidad: boletos.length,
        total
      });

    } catch (error) {
      console.error("ERROR PRODUCCIÓN:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo consultar la producción"
      });
    }
  });


  // Actualizar GPS del recorrido activo
  router.post("/ubicacion", async (req, res) => {
    try {
      const authorization = req.headers.authorization || "";
      const token = authorization.startsWith("Bearer ")
        ? authorization.slice(7).trim()
        : "";

      const sesion = sesiones.get(token);

      if (!sesion || sesion.expira < Date.now()) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesión vencida"
        });
      }

      const latitud = Number(req.body?.latitud);
      const longitud = Number(req.body?.longitud);

      if (
        !Number.isFinite(latitud) ||
        !Number.isFinite(longitud) ||
        latitud < -90 || latitud > 90 ||
        longitud < -180 || longitud > 180 ||
        req.body?.latitud == null ||
        req.body?.longitud == null
      ) {
        return res.status(400).json({
          ok: false,
          mensaje: "Ubicación inválida"
        });
      }

      const { data: conductor, error: errorConductor } =
        await supabase
          .from("conductores")
          .select("activo")
          .eq("id", sesion.conductor_id)
          .maybeSingle();

      if (errorConductor) throw errorConductor;

      if (!conductor?.activo) {
        return res.status(403).json({
          ok: false,
          mensaje: "Conductor no habilitado"
        });
      }

      const { data, error } = await supabase
        .from("recorridos_conductor")
        .update({
          latitud,
          longitud,
          gps_actualizado_at: new Date().toISOString()
        })
        .eq("conductor_id", sesion.conductor_id)
        .eq("estado", "activo")
        .select("id");

      if (error) throw error;

      if (!data?.length) {
        return res.status(404).json({
          ok: false,
          mensaje: "No existe un recorrido activo"
        });
      }

      return res.json({ ok: true });

    } catch (error) {
      console.error("ERROR GPS CONDUCTOR:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo actualizar la ubicación"
      });
    }
  });

  return router;
}

module.exports = crearRutasConductores;

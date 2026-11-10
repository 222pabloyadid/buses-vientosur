const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const protegerAdmin = require("./seguridad-admin");
const gpsPrueba = require("./gps-prueba");

module.exports = function crearAdminConductores(supabase) {
  const router = express.Router();

  router.use(protegerAdmin);

  // Registrar conductor

  router.post("/crear", async (req, res) => {
    let nuevoId = null;

    try {
      const nombre = String(req.body?.nombre || "").trim();
      const usuario = String(req.body?.usuario || "")
        .trim().toLowerCase();

      if (
        nombre.length < 3 ||
        nombre.length > 100 ||
        !/^[a-z0-9._-]{4,40}$/.test(usuario)
      ) {
        return res.status(400).json({
          ok: false,
          mensaje: "Revisa nombre y usuario (mínimo 4 caracteres)."
        });
      }

      const clave_hash = await bcrypt.hash(
        crypto.randomBytes(32).toString("hex"), 12
      );

      const { data, error } = await supabase
        .from("conductores")
        .insert({
          nombre,
          usuario,
          clave_hash,
          activo: false,
          pendiente_activacion: true
        })
        .select("id,nombre,usuario")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({
            ok: false,
            mensaje: "Ese usuario ya existe."
          });
        }
        throw error;
      }

      nuevoId = data.id;

      const token = crypto.randomBytes(32).toString("hex");
      const token_hash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

      const { error: errorInvitacion } = await supabase
        .from("invitaciones_conductores")
        .insert({
          conductor_id: nuevoId,
          token_hash,
          expira_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString()
        });

      if (errorInvitacion) throw errorInvitacion;

      return res.status(201).json({
        ok: true,
        conductor: data,
        enlace: "https://busesvientosur.cl/activar-conductor.html?token=" + token
      });

    } catch (error) {
      console.error("ERROR CREANDO CONDUCTOR:", error);

      if (nuevoId) {
        await supabase.from("conductores")
          .delete().eq("id", nuevoId);
      }

      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo crear la invitación."
      });
    }
  });


  // Nueva invitación, exclusivamente para cuentas pendientes
  router.post("/:id/invitar", async (req, res) => {
    try {
      const { data: registrado, error: consultaError } =
        await supabase.from("conductores")
        .select("id,nombre,usuario,activo,pendiente_activacion,eliminado_at")
        .eq("id", req.params.id)
        .maybeSingle();

      if (consultaError) throw consultaError;

      if (
        !registrado ||
        registrado.activo ||
        !registrado.pendiente_activacion ||
        registrado.eliminado_at
      ) {
        return res.status(409).json({
          ok: false,
          mensaje: "Solo puedes invitar a conductores pendientes de activación."
        });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const hash = crypto.createHash("sha256")
        .update(token).digest("hex");

      const { error } = await supabase
        .from("invitaciones_conductores")
        .insert({
          conductor_id: registrado.id,
          token_hash: hash,
          expira_at: new Date(
            Date.now() + 86400000
          ).toISOString()
        });

      if (error) throw error;

      return res.json({
        ok: true,
        enlace: "https://busesvientosur.cl/activar-conductor.html?token=" + token
      });

    } catch (error) {
      console.error("ERROR INVITACION:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo generar la invitación."
      });
    }
  });

  // Consultar conductores
  router.get("/listar", async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("conductores")
        .select("id,nombre,usuario,activo,creado_at")
        .order("nombre");

      if (error) throw error;

      res.json({ ok: true, conductores: data || [] });

    } catch (error) {
      console.error("ERROR LISTANDO CONDUCTORES:", error);
      res.status(500).json({ ok: false });
    }
  });




  router.patch("/:id/estado", async (req, res) => {
    try {
      const accion = req.body?.accion;

      if (!["suspender", "reactivar", "eliminar"].includes(accion)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Acción inválida"
        });
      }

      const { data: registrado, error: consultaError } =
        await supabase.from("conductores")
        .select("id,pendiente_activacion,eliminado_at")
        .eq("id", req.params.id)
        .maybeSingle();

      if (consultaError) throw consultaError;

      if (!registrado || registrado.eliminado_at) {
        return res.status(404).json({
          ok: false,
          mensaje: "Conductor no encontrado"
        });
      }

      if (accion === "reactivar" && registrado.pendiente_activacion) {
        return res.status(409).json({
          ok: false,
          mensaje: "Primero debe activar su cuenta con WhatsApp."
        });
      }

      const cambios = {
        activo: accion === "reactivar"
      };

      if (accion === "eliminar") {
        cambios.eliminado_at = new Date().toISOString();
        cambios.pendiente_activacion = false;
      }

      const { error } = await supabase
        .from("conductores")
        .update(cambios)
        .eq("id", registrado.id)
        .is("eliminado_at", null);

      if (error) throw error;

      return res.json({
        ok: true,
        mensaje: accion === "eliminar"
          ? "Conductor dado de baja. Historial conservado."
          : accion === "reactivar"
            ? "Conductor reactivado."
            : "Conductor suspendido."
      });

    } catch (error) {
      console.error("ERROR ESTADO CONDUCTOR:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo actualizar el conductor."
      });
    }
  });

  // Seguimiento GPS de conductores con recorridos activos
  router.get("/ubicaciones", async (req, res) => {
    try {
      const { data: recorridos, error } = await supabase
        .from("recorridos_conductor")
        .select(
          "id,conductor_id,fecha,hora,origen,destino,latitud,longitud,gps_actualizado_at,iniciado_at"
        )
        .eq("estado", "activo");

      if (error) throw error;

      const { data: conductores, error: errorConductores } =
        await supabase
          .from("conductores")
          .select("id,nombre,usuario,activo");

      if (errorConductores) throw errorConductores;

      const nombres = new Map(
        (conductores || []).map(c => [c.id, c])
      );

      const ubicaciones = (recorridos || []).map(r => {
        const conductor = nombres.get(r.conductor_id);

        const antiguedad = r.gps_actualizado_at
          ? Date.now() - new Date(r.gps_actualizado_at).getTime()
          : null;

        return {
          recorrido_id: r.id,
          nombre: conductor?.nombre || "Conductor",
          usuario: conductor?.usuario || "",
          activo: conductor?.activo === true,
          origen: r.origen,
          destino: r.destino,
          fecha: r.fecha,
          hora: r.hora,
          latitud: r.latitud,
          longitud: r.longitud,
          gps_actualizado_at: r.gps_actualizado_at,
          iniciado_at: r.iniciado_at,
          gps_reciente: antiguedad !== null &&
            antiguedad >= 0 &&
            antiguedad < 60000
        };
      });

      res.set("Cache-Control", "no-store");

      for (const prueba of gpsPrueba.listar()) {
        const conductor = nombres.get(prueba.conductor_id);
        if (!conductor?.activo) continue;

        ubicaciones.push({
          recorrido_id: "prueba-" + prueba.conductor_id,
          nombre: conductor.nombre || "Conductor",
          usuario: conductor.usuario || "",
          activo: true,
          origen: "GPS DE PRUEBA",
          destino: "Sin recorrido",
          fecha: "",
          hora: "PRUEBA",
          latitud: prueba.latitud,
          longitud: prueba.longitud,
          gps_actualizado_at: prueba.gps_actualizado_at,
          gps_reciente: true,
          es_prueba: true
        });
      }

      res.json({ ok: true, ubicaciones });

    } catch (error) {
      console.error("ERROR SEGUIMIENTO CONDUCTORES:", error);
      res.status(500).json({
        ok: false,
        mensaje: "No se pudieron consultar las ubicaciones"
      });
    }
  });


  // Consultar incidencias para administración
  router.get("/incidencias", async (req, res) => {
    try {
      const { data: incidencias, error } = await supabase
        .from("incidencias_conductor")
        .select(
          "id,recorrido_id,conductor_id,motivo,estado,creado_at"
        )
        .order("creado_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      const ids = [...new Set(
        (incidencias || []).map(i => i.conductor_id)
      )];

      const recorridosIds = [...new Set(
        (incidencias || []).map(i => i.recorrido_id)
      )];

      let conductores = [];
      let recorridos = [];

      if (ids.length) {
        const resultado = await supabase
          .from("conductores")
          .select("id,nombre")
          .in("id", ids);

        if (resultado.error) throw resultado.error;
        conductores = resultado.data || [];
      }

      if (recorridosIds.length) {
        const resultado = await supabase
          .from("recorridos_conductor")
          .select("id,fecha,hora,origen,destino,latitud,longitud")
          .in("id", recorridosIds);

        if (resultado.error) throw resultado.error;
        recorridos = resultado.data || [];
      }

      const mapaConductores = new Map(
        conductores.map(c => [c.id, c])
      );

      const mapaRecorridos = new Map(
        recorridos.map(r => [r.id, r])
      );

      const resultado = (incidencias || []).map(i => ({
        ...i,
        conductor: mapaConductores.get(i.conductor_id)?.nombre
          || "Conductor desconocido",
        recorrido: mapaRecorridos.get(i.recorrido_id) || null
      }));

      res.set("Cache-Control", "no-store");

      return res.json({
        ok: true,
        incidencias: resultado
      });

    } catch (error) {
      console.error("ERROR CONSULTANDO INCIDENCIAS:", error);

      return res.status(500).json({
        ok: false,
        mensaje: "No se pudieron consultar las incidencias"
      });
    }
  });

  return router;
};

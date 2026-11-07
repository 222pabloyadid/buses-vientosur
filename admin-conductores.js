const express = require("express");
const bcrypt = require("bcryptjs");
const protegerAdmin = require("./seguridad-admin");

module.exports = function crearAdminConductores(supabase) {
  const router = express.Router();

  router.use(protegerAdmin);

  // Registrar conductor
  router.post("/crear", async (req, res) => {
    try {
      const nombre = String(req.body?.nombre || "").trim();
      const usuario = String(req.body?.usuario || "")
        .trim().toLowerCase();
      const password = req.body?.password;

      if (
        nombre.length < 3 ||
        nombre.length > 100 ||
        !/^[a-z0-9._-]{4,40}$/.test(usuario) ||
        typeof password !== "string" ||
        password.length < 12 ||
        password.length > 128
      ) {
        return res.status(400).json({
          ok: false,
          mensaje: "Revisa el nombre, usuario y contraseña. La contraseña debe tener al menos 12 caracteres."
        });
      }

      const clave_hash = await bcrypt.hash(password, 12);

      const { data, error } = await supabase
        .from("conductores")
        .insert({
          nombre,
          usuario,
          clave_hash,
          activo: true
        })
        .select("id,nombre,usuario,activo")
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

      return res.status(201).json({
        ok: true,
        conductor: data
      });

    } catch (error) {
      console.error("ERROR CREANDO CONDUCTOR:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo registrar al conductor."
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
      res.json({ ok: true, ubicaciones });

    } catch (error) {
      console.error("ERROR SEGUIMIENTO CONDUCTORES:", error);
      res.status(500).json({
        ok: false,
        mensaje: "No se pudieron consultar las ubicaciones"
      });
    }
  });

  return router;
};

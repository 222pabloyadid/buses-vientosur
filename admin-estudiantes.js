const express = require("express");
const protegerAdmin = require("./seguridad-admin");

module.exports = function (supabase) {
  const router = express.Router();
  router.use(protegerAdmin);

  function limpiarRut(valor) {
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
    const dv = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
    return rut.slice(-1) === dv;
  }

  router.get("/buscar", async (req, res) => {
    try {
      const rut = limpiarRut(req.query.rut);
      if (!rutValido(rut)) {
        return res.status(400).json({ok:false,mensaje:"RUT inválido."});
      }

      const {data,error} = await supabase
        .from("estudiantes_vientosur")
        .select("rut,nombre,origen,destino,vencimiento,precio_estudiante,estado,precio_estudiante")
        .eq("rut",rut)
        .maybeSingle();

      if (error) throw error;
      res.json({ok:true,estudiante:data || null});
    } catch (error) {
      console.error("BUSCAR ESTUDIANTE:",error);
      res.status(500).json({ok:false,mensaje:"Error al buscar."});
    }
  });

  router.post("/guardar", async (req,res) => {
    try {
      const rut = limpiarRut(req.body.rut);
      const nombre = String(req.body.nombre || "").trim();
      const origen = String(req.body.origen || "").trim();
      const destino = String(req.body.destino || "").trim();
      const vencimiento = String(req.body.vencimiento || "");
      const precio_estudiante = Number(req.body.precio_estudiante);

      const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(vencimiento) &&
        !Number.isNaN(Date.parse(vencimiento)) &&
        new Date(vencimiento).toISOString().slice(0,10) === vencimiento;

      if (!rutValido(rut) || nombre.length < 3 ||
          nombre.length > 120 || !origen || !destino ||
          origen === destino || !fechaValida || !Number.isSafeInteger(precio_estudiante) || precio_estudiante <= 0) {
        return res.status(400).json({
          ok:false,mensaje:"Revisa RUT, nombre, ruta y vencimiento."
        });
      }

      const {error} = await supabase
        .from("estudiantes_vientosur")
        .upsert({
          rut,nombre,origen,destino,vencimiento,
          precio_estudiante,
          estado:"activo",
          actualizado_at:new Date().toISOString()
        },{onConflict:"rut"});

      if (error) throw error;
      res.json({ok:true,mensaje:"Estudiante guardado y activado."});
    } catch (error) {
      console.error("GUARDAR ESTUDIANTE:",error);
      res.status(500).json({ok:false,mensaje:"Error al guardar."});
    }
  });

  router.patch("/estado", async (req,res) => {
    try {
      const rut = limpiarRut(req.body.rut);
      const estado = req.body.estado;

      if (!rutValido(rut) ||
          !["activo","bloqueado","desactivado"].includes(estado)) {
        return res.status(400).json({ok:false,mensaje:"Datos inválidos."});
      }

      const {data,error} = await supabase
        .from("estudiantes_vientosur")
        .update({estado,actualizado_at:new Date().toISOString()})
        .eq("rut",rut)
        .select("rut,estado")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(404).json({
          ok:false,mensaje:"Estudiante no encontrado."
        });
      }
      res.json({ok:true,mensaje:"Estado actualizado.",estudiante:data});
    } catch (error) {
      console.error("ESTADO ESTUDIANTE:",error);
      res.status(500).json({ok:false,mensaje:"Error al actualizar."});
    }
  });

  return router;
};

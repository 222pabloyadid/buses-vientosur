const proteger = require("./acceso-horarios.js");

module.exports = (app, supabase) => {

  app.get("/api/admin/control-horarios", proteger, async (req, res) => {
    const { data, error } = await supabase
      .from("bloqueos_salidas")
      .select("sentido,tipo_dia,hora");

    if (error) return res.status(500).json({ ok: false });

    const { data: antiguos, error: errorAntiguos } =
      await supabase
        .from("horarios_bloqueados")
        .select("hora");

    if (errorAntiguos) {
      return res.status(500).json({
        ok: false,
        error: "No se pudieron consultar los bloqueos anteriores"
      });
    }

    res.json({
      ok: true,
      bloqueos: data,
      bloqueos_antiguos: (antiguos || []).map(x => x.hora)
    });
  });

  app.post("/api/admin/control-horarios", proteger, async (req, res) => {
    const { sentido, tipo_dia, hora, bloquear } = req.body;

    if (
      !["Tolten_Temuco", "Temuco_Tolten"].includes(sentido) ||
      !["semana", "sabado", "domingo"].includes(tipo_dia) ||
      !/^\d{2}:\d{2}$/.test(hora) ||
      typeof bloquear !== "boolean"
    ) {
      return res.status(400).json({ ok: false });
    }

    const tabla = supabase.from("bloqueos_salidas");

    const resultado = bloquear
      ? await tabla.upsert(
          { sentido, tipo_dia, hora },
          { onConflict: "sentido,tipo_dia,hora" }
        )
      : await tabla.delete()
          .eq("sentido", sentido)
          .eq("tipo_dia", tipo_dia)
          .eq("hora", hora);

    if (resultado.error) {
      return res.status(500).json({ ok: false });
    }

    res.json({ ok: true });
  });
};

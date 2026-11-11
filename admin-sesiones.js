const crypto = require("crypto");

module.exports = function instalarSesionesAdmin(router, db) {
  const DURACION = 30 * 24 * 60 * 60 * 1000;
  const intentos = new Map();

  const hash = valor => crypto
    .createHash("sha256")
    .update(valor)
    .digest("hex");

  router.post("/login", async (req, res) => {
    try {
      const configurada = process.env.ADMIN_CONDUCTORES_CLAVE;
      const recibida = req.body?.clave;
      const ip = req.ip;
      const ahora = Date.now();

      const control = intentos.get(ip);
      if (control && control.hasta > ahora && control.cantidad >= 5) {
        return res.status(429).json({
          ok: false,
          mensaje: "Demasiados intentos. Intenta en 15 minutos."
        });
      }

      if (!configurada || configurada.length < 16) {
        return res.status(503).json({
          ok: false,
          mensaje: "Administrador no configurado"
        });
      }

      if (typeof recibida !== "string") {
        return res.status(400).json({ ok: false });
      }

      const correcto = crypto.timingSafeEqual(
        Buffer.from(hash(configurada), "hex"),
        Buffer.from(hash(recibida), "hex")
      );

      if (!correcto) {
        const previo = control && control.hasta > ahora
          ? control.cantidad : 0;

        intentos.set(ip, {
          cantidad: previo + 1,
          hasta: ahora + 15 * 60000
        });

        return res.status(401).json({
          ok: false,
          mensaje: "Clave incorrecta"
        });
      }

      intentos.delete(ip);

      const token = crypto.randomBytes(32).toString("hex");

      const { error } = await db
        .from("sesiones_admin_conductores")
        .insert({
          token_hash: hash(token),
          expira_at: new Date(ahora + DURACION).toISOString()
        });

      if (error) throw error;

      return res.json({ ok: true, token });

    } catch (error) {
      console.error("ERROR LOGIN ADMIN:", error);
      return res.status(500).json({
        ok: false,
        mensaje: "No se pudo iniciar sesion"
      });
    }
  });

  router.use(async (req, res, next) => {
    try {
      const token = String(
        req.headers.authorization || ""
      ).replace(/^Bearer /, "").trim();

      if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(401).json({ ok: false });
      }

      const tokenHash = hash(token);

      const { data, error } = await db
        .from("sesiones_admin_conductores")
        .select("expira_at,ultimo_uso_at")
        .eq("token_hash", tokenHash)
        .is("revocado_at", null)
        .maybeSingle();

      if (error) throw error;

      const ahora = Date.now();

      if (!data || Date.parse(data.expira_at) <= ahora) {
        return res.status(401).json({
          ok: false,
          mensaje: "Sesion vencida"
        });
      }

      const ultimo = data.ultimo_uso_at
        ? Date.parse(data.ultimo_uso_at) : 0;

      if (ahora - ultimo > 86400000) {
        const { data: renovada, error: errorRenovar } = await db
          .from("sesiones_admin_conductores")
          .update({
            ultimo_uso_at: new Date(ahora).toISOString(),
            expira_at: new Date(ahora + DURACION).toISOString()
          })
          .eq("token_hash", tokenHash)
          .is("revocado_at", null)
          .gt("expira_at", new Date(ahora).toISOString())
          .select("token_hash")
          .maybeSingle();

        if (errorRenovar) throw errorRenovar;
        if (!renovada) {
          return res.status(401).json({ ok: false });
        }
      }

      req.tokenHashAdmin = tokenHash;
      next();

    } catch (error) {
      console.error("ERROR SESION ADMIN:", error);
      res.status(503).json({
        ok: false,
        mensaje: "No se pudo verificar la sesion"
      });
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      const { error } = await db
        .from("sesiones_admin_conductores")
        .update({ revocado_at: new Date().toISOString() })
        .eq("token_hash", req.tokenHashAdmin);

      if (error) throw error;

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({
        ok: false,
        mensaje: "No se pudo cerrar sesion"
      });
    }
  });
};

const crypto = require("crypto");

module.exports = function protegerPanel(req, res, next) {
  const clave = process.env.CLAVE_PANEL_HORARIOS;
  const recibida = req.headers.authorization || "";

  if (!clave || !recibida.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: "Acceso no autorizado"
    });
  }

  const a = crypto.createHash("sha256")
    .update(recibida.slice(7)).digest();

  const b = crypto.createHash("sha256")
    .update(clave).digest();

  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({
      ok: false,
      error: "Clave incorrecta"
    });
  }

  next();
};

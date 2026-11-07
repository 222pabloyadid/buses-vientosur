const crypto = require("crypto");

function protegerAdmin(req, res, next) {
  const claveConfigurada = process.env.ADMIN_CONDUCTORES_CLAVE;

  if (!claveConfigurada || claveConfigurada.length < 16) {
    return res.status(503).json({
      ok: false,
      mensaje: "Administrador no configurado"
    });
  }

  const autorizacion = req.headers.authorization || "";

  if (!autorizacion.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      mensaje: "Acceso no autorizado"
    });
  }

  const claveRecibida = autorizacion.slice(7).trim();

  const esperado = crypto.createHash("sha256")
    .update(claveConfigurada)
    .digest();

  const recibido = crypto.createHash("sha256")
    .update(claveRecibida)
    .digest();

  if (!crypto.timingSafeEqual(esperado, recibido)) {
    return res.status(401).json({
      ok: false,
      mensaje: "Clave incorrecta"
    });
  }

  next();
}

module.exports = protegerAdmin;

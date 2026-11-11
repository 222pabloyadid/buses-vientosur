const { Resend } = require("resend");

function crearServicioBienvenida(supabase) {
  const resend = new Resend(process.env.RESEND_API_KEY);

  function escaparHTML(valor) {
    return String(valor || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  async function enviarBienvenida(usuario) {
    if (!usuario?.id || !usuario?.email || !usuario?.email_confirmed_at) {
      return { enviado: false, motivo: "Cuenta sin confirmar" };
    }

    const correo = usuario.email.trim().toLowerCase();
    const nombre = escaparHTML(
      usuario.user_metadata?.nombre?.trim() || "pasajero"
    );

    const { error: errorReserva } = await supabase
      .from("correos_bienvenida")
      .insert({
        usuario_id: usuario.id,
        correo,
        tipo: "bienvenida",
        estado: "pendiente"
      });

    if (errorReserva) {
      if (errorReserva.code === "23505") {
        return { enviado: false, motivo: "Ya registrado" };
      }
      throw errorReserva;
    }

    try {
      const { data, error } = await resend.emails.send({
        from: "Buses VientoSur <ventas@busesvientosur.cl>",
        to: correo,
        subject: "💙 ¡Bienvenido a bordo! Gracias por ser parte de Buses VientoSur",
        html: `
          <div style="background:#eef5fa;padding:25px;font-family:Arial,sans-serif">
            <div style="max-width:580px;margin:auto;background:white;border-radius:18px;padding:30px;color:#263746;line-height:1.8">

              <h1 style="color:#0876ad;text-align:center">
                🚌💙 ¡Bienvenido a bordo, ${nombre}!
              </h1>

              <h2 style="text-align:center">Hoy queremos darte las gracias.</h2>

              <p>Gracias por confiar en nosotros, por elegirnos y por permitirnos ser parte de tus viajes.</p>

              <p>Sabemos que detrás de cada pasaje hay una historia: alguien que va a trabajar, un estudiante que persigue sus sueños, una familia que espera un abrazo o una persona que simplemente quiere regresar a casa.</p>

              <p><strong>Y para nosotros, cada una de esas historias importa. 💙</strong></p>

              <p>En <strong>Buses VientoSur</strong> creemos que viajar no se trata solamente de llegar a un destino, sino también de sentirse acompañado, respetado y valorado durante el camino.</p>

              <p>Por eso seguimos creciendo e incorporando nuevas formas de hacer tus viajes más fáciles.</p>

              <p>Hoy puedes comprar tus pasajes por internet, elegir tu asiento y recibir tu boleto directamente en tu correo.</p>

              <p><strong>Porque nuestro compromiso no es solamente llevarte. Es mejorar cada día para ti.</strong></p>

              <p>Quizás seamos parte de un pequeño momento de tu vida, pero queremos que ese momento sea una buena experiencia.</p>

              <h2 style="color:#0876ad;text-align:center">
                ✨ Tu preferencia nos hace mejores.
              </h2>

              <p>Gracias por subirte a este sueño que seguimos construyendo con esfuerzo, cariño y dedicación.</p>

              <p><strong>¡Que nunca te falten caminos por recorrer ni motivos para volver a casa! 💙</strong></p>

              <p>Con mucho cariño,<br><strong>El equipo de Buses VientoSur 🕊️</strong></p>

              <p style="text-align:center;margin-top:30px">
                <a href="https://busesvientosur.cl"
                   style="background:#0876ad;color:white;padding:15px 25px;border-radius:10px;text-decoration:none;font-weight:bold">
                  Comprar mis pasajes
                </a>
              </p>
            </div>
          </div>
        `,
        ...(usuario.id ? {
          headers: {
            "X-Entity-Ref-ID": "bienvenida-" + usuario.id
          }
        } : {})
      }, {
        idempotencyKey: "bienvenida-" + usuario.id
      });

      if (error) throw error;

      const { error: errorGuardar } = await supabase
        .from("correos_bienvenida")
        .update({
          estado: "enviado",
          enviado_at: new Date().toISOString(),
          resend_id: data?.id || null
        })
        .eq("usuario_id", usuario.id);

      if (errorGuardar) throw errorGuardar;

      return { enviado: true };

    } catch (error) {
      await supabase
        .from("correos_bienvenida")
        .update({ estado: "error" })
        .eq("usuario_id", usuario.id);

      throw error;
    }
  }

  return { enviarBienvenida };
}

module.exports = { crearServicioBienvenida };

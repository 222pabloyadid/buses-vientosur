

const express = require("express");
const cors = require("cors");
const fs = require('fs');
const PDFDocument = require("pdfkit");
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { MercadoPagoConfig, Preference } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: (process.env.MP_ACCESS_TOKEN || '').trim()
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

let bloqueados = [];

async function cargarBloqueos() {
  const { data, error } = await supabase
    .from("horarios_bloqueados")
    .select("hora");

  if (error) {
    console.error(error);
    return;
  }

  bloqueados = data.map(x => x.hora);
  console.log("Bloqueos cargados:", bloqueados);
}

cargarBloqueos();



const { Resend } = require("resend");
const { crearServicioBienvenida } = require("./correos-bienvenida");
const resend = new Resend(process.env.RESEND_API_KEY);


async function enviarCorreoSMTP(correo, nombre, origen, destino, fecha, hora, asiento, codigoQR = null, pagoId = null, intentoCorreo = 0, precio = null, tipoPasaje = "adulto") {
  console.log("📧 Enviando correo a:", correo);

  try {
    // generar PDF
    const archivoPDF = await generarPDF(nombre, origen, destino, fecha, hora, asiento, codigoQR, precio, tipoPasaje);

    const { data: correoEnviado, error: errorResend } = await resend.emails.send({
      from: "Buses VientoSur <ventas@busesvientosur.cl>",
      to: correo,
      subject: "Tu pasaje Buses VientoSur",
      html: `
        <h2>🚌 Boleto Confirmado</h2>
        <p>Nombre: ${nombre}</p>
        <p>Ruta: ${origen} - ${destino}</p>
        <p>Fecha: ${fecha}</p>
        <p>Hora: ${hora}</p>
        <p>Asiento: ${asiento}</p>
        <hr>
        <h3>SEGUIR MI BUS</h3>
        <p>Para consultar tu bus, copia este código privado:</p>
        <p style="overflow-wrap:anywhere;font-weight:bold">
          ${codigoQR || "No disponible"}
        </p>
        <p>
          <a href="https://busesvientosur.cl/seguir-mi-bus.html">
            BUSCAR MI BUS
          </a>
        </p>
        <p>Este código es personal. No lo compartas.</p>
      `,
      attachments: [
        {
          filename: "boleto.pdf",
          content: require("fs").readFileSync(archivoPDF)
        }
      ]
    }, pagoId ? {
      idempotencyKey: "boleto-" + String(pagoId) + "-intento-" + String(intentoCorreo)
    } : undefined);

    if (errorResend) {
      throw errorResend;
    }

    console.log("CORREO ACEPTADO POR RESEND:", correoEnviado?.id);
    return true;

  } catch (error) {
    console.error("ERROR ENVIANDO CORREO:", error);
    return false;
  }
}
 

function generarPDF(nombre, origen, destino, fecha, hora, asiento, codigoQR = null, precio = null, tipoPasaje = 'adulto') {
  return new Promise(async (resolve, reject) => {
    const path = require("path");
    const QRCode = require("qrcode");
    const file = path.join(
      require("os").tmpdir(),
      "boleto_" + Date.now() + "_" +
      require("crypto").randomBytes(4).toString("hex") + ".pdf"
    );

    const doc = new PDFDocument({
      size: [340, 625],
      margin: 0,
      autoFirstPage: true
    });

    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    stream.on("finish", () => resolve(file));
    stream.on("error", reject);
    doc.on("error", reject);

    // Fondo y encabezado
    doc.rect(0, 0, 340, 625).fill("#f1f5f9");
    doc.roundedRect(12, 12, 316, 601, 12).fill("#ffffff");
    doc.roundedRect(12, 12, 316, 94, 12).fill("#103b70");
    doc.rect(12, 88, 316, 18).fill("#103b70");

    const logo = path.join(__dirname, "public", "logo.png");

    if (fs.existsSync(logo)) {
      try {
        doc.image(logo, 26, 25, {
          fit: [65, 65],
          align: "center",
          valign: "center"
        });
      } catch (e) {
        console.log("No se pudo insertar el logo:", e.message);
      }
    }

    doc.fillColor("#ffffff")
       .font("Helvetica-Bold")
       .fontSize(18)
       .text("VIENTOSUR", 100, 36, {
         width: 210,
         align: "center",
         lineBreak: false
       });

    doc.font("Helvetica")
       .fontSize(9)
       .text("PASAJE ELECTRONICO", 100, 64, {
         width: 210,
         align: "center"
       });

    // Ruta del pasajero
    doc.fillColor("#64748b")
       .fontSize(9)
       .text("ORIGEN", 28, 124);

    doc.text("DESTINO", 183, 124);

    doc.fillColor("#103b70")
       .font("Helvetica-Bold")
       .fontSize(15)
       .text(String(origen || "-"), 28, 140, {
         width: 128,
         height: 38
       });

    doc.text(String(destino || "-"), 183, 140, {
      width: 128,
      height: 38
    });

    doc.moveTo(28, 187)
       .lineTo(312, 187)
       .strokeColor("#dbe3ed")
       .stroke();

    // Información del viaje
    function campo(etiqueta, valor, x, y, ancho = 130) {
      doc.font("Helvetica")
         .fontSize(9)
         .fillColor("#64748b")
         .text(etiqueta, x, y, { width: ancho });

      doc.font("Helvetica-Bold")
         .fontSize(12)
         .fillColor("#172b4d")
         .text(String(valor || "-"), x, y + 16, {
           width: ancho,
           height: 30
         });
    }

    campo("FECHA", fecha, 28, 202);
    campo("HORA DE SALIDA", hora, 183, 202);
    campo("PASAJERO", nombre, 28, 259, 175);
    campo("ASIENTO", asiento, 232, 259, 80);

    const etiquetaPasaje = tipoPasaje === "estudiante"
      ? "PASAJE ESTUDIANTE"
      : "PASAJE ADULTO";

    doc.font("Helvetica-Bold")
       .fontSize(12)
       .fillColor("#dc2626")
       .text(etiquetaPasaje, 28, 297, {
         width: 170,
         align: "left"
       });

    const valorPasaje = Number(precio);
    const precioTexto = Number.isFinite(valorPasaje) && valorPasaje >= 0
      ? "$" + valorPasaje.toLocaleString("es-CL")
      : "No disponible";

    doc.font("Helvetica-Bold")
       .fontSize(11)
       .fillColor("#103b70")
       .text(precioTexto, 203, 297, {
         width: 109,
         align: "right"
       });

    doc.moveTo(28, 319)
       .lineTo(312, 319)
       .strokeColor("#dbe3ed")
       .stroke();

    doc.font("Helvetica-Bold")
       .fontSize(10)
       .fillColor("#103b70")
       .text("INFORMACION IMPORTANTE", 28, 333, {
         width: 284,
         align: "center"
       });

    doc.font("Helvetica")
       .fontSize(9)
       .fillColor("#334155")
       .text(
         "Presentarse 20 minutos antes de la salida.",
         28, 354, { width: 284, align: "center" }
       );

    doc.text(
      "Conserva este boleto para presentarlo al conductor.",
      28, 371, { width: 284, align: "center" }
    );

    doc.text(
      "Condiciones de cambios y devoluciones segun normativa vigente.",
      28, 388, { width: 284, align: "center" }
    );

    // QR del boleto
    if (codigoQR) {
      const imagenQR = await QRCode.toBuffer(codigoQR, {
        type: "png",
        width: 300,
        margin: 1,
        errorCorrectionLevel: "M"
      });

      doc.image(imagenQR, 119, 414, {
        width: 102,
        height: 102
      });
      // Codigo privado del boleto, debajo del QR
      doc.font("Helvetica")
         .fontSize(6)
         .fillColor("#103b70")
         .text("CODIGO PARA SEGUIR MI BUS", 28, 522, {
           width: 284,
           align: "center"
         });

      doc.font("Helvetica")
         .fontSize(5.5)
         .fillColor("#334155")
         .text(String(codigoQR), 28, 536, {
           width: 284,
           align: "center",
           lineBreak: false
         });



    }

    doc.roundedRect(28, 559, 284, 32, 6).fill("#e8f4f8");

    doc.fillColor("#103b70")
       .font("Helvetica-Bold")
       .fontSize(10)
       .text("Gracias por viajar con VientoSur", 35, 569, {
         width: 270,
         align: "center"
       });

    doc.end();
  });
}

const app = express();

app.use(cors({
  origin: ["https://busesvientosur.cl", "https://www.busesvientosur.cl"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use(
  "/api/conductor",
  require("./conductores.js")(supabase)
);

app.use(
  "/api/admin/conductores",
  require("./admin-conductores.js")(supabase)
);




app.use(
  "/api/admin/estudiantes",
  require("./admin-estudiantes.js")(supabase)
);

app.use(express.static("public"));
app.use(express.static(__dirname));

// IMPORTAR ARCHIVOS
const horarios = require("./horarios.js");

require("./control-horarios.js")(app, supabase);

const tarifas = require("./tarifas.js");
const estudiantes = require("./data/estudiantes");
//const bloqueados = require("./bloqueos.js");
const filtrarPorTiempo = require("./filtroTiempo.js");
const { guardarVenta } = require("./ventas.js");



// RUTA PRINCIPAL
app.get("/", (req, res) => {
  res.send("App Buses funcionando 🚍");
});


// 🔎 BUSCAR HORARIOS
app.get("/horarios", async (req, res) => {
  const { dia, origen, destino, fecha } = req.query;

  let tipoDia = "semana";

  if (dia === "sabado") tipoDia = "sabado";
  if (dia === "domingo") tipoDia = "domingo";

  let resultado = [];

  // HACIA TEMUCO (mostrar todos)
  let destinoReal = destino;

  // Freire usa los horarios de Temuco
  if (destino === "Freire") {
    destinoReal = "Temuco";
  }

  // 🔥 SI SALES DESDE TEMUCO
  if (origen === "Temuco") {

  let destinoReal = destino;

  // 🔥 TODAS las paradas usan horarios de Tolten
  if (
    destino === "Lolen" ||
    destino === "Arauco" ||
    destino === "Parada21" ||
    destino === "LasDichas" ||
    destino === "Limite" ||
    destino === "BarrosArana" ||
    destino === "Parada31" ||
    destino === "TeodoroSchmidt" ||
    destino === "Hualpin" ||
    destino === "Tolten"
  ) {
    destinoReal = "Tolten";
  }

  const clave = `Temuco_${destinoReal}`;
  resultado = horarios[tipoDia][clave] || [];

} else {
  const clave = `${origen}_${destinoReal}`;
  resultado = horarios[tipoDia][clave] || [];

if (fecha) {
  const ahora = new Date();

  const hoy = ahora.getFullYear() + "-" +
              String(ahora.getMonth() + 1).padStart(2, "0") + "-" +
              String(ahora.getDate()).padStart(2, "0");

  if (fecha < hoy) {
    resultado = [];
  } 
 
  if (String(fecha) === String(hoy)) {
    resultado = resultado.filter(hora => {
      const horaStr = typeof hora === "string" ? hora : hora.hora;

      const [h, m] = horaStr.split(":");

      const salida = new Date();
      salida.setHours(parseInt(h));
      salida.setMinutes(parseInt(m));
      
      salida.setSeconds(0);

      salida.setMinutes(salida.getMinutes() - 10);

      return ahora < salida;
    });
  }
}


}



  // BLOQUEO NUEVO POR BUS, SENTIDO Y TIPO DE DIA
  try {
    const sentidoControl = origen === "Temuco"
      ? "Temuco_Tolten"
      : "Tolten_Temuco";

    const { data, error } = await supabase
      .from("bloqueos_salidas")
      .select("hora")
      .eq("sentido", sentidoControl)
      .eq("tipo_dia", tipoDia);

    if (error) throw error;

    const cerradas = new Set(
      (data || []).map(x => x.hora)
    );

    const paradas = {
      Tolten: "Tolten_Temuco",
      Hualpin: "Hualpin_Temuco",
      TeodoroSchmidt: "TeodoroSchmidt_Temuco",
      BarrosArana: "BarrosArana_Temuco",
      Pitrufquen: "Pitrufquen_Temuco"
    };

    resultado = resultado.filter(item => {
      const hora = typeof item === "string"
        ? item : item.hora;

      if (origen === "Temuco") {
        return !cerradas.has(hora);
      }

      const principales =
        horarios[tipoDia].Tolten_Temuco || [];

      const lista =
        horarios[tipoDia][paradas[origen]] || [];

      const posicion = lista.indexOf(hora);

      const salida = origen === "Pitrufquen"
        ? "06:30"
        : posicion >= 0 && principales[posicion]
          ? principales[posicion] : hora;

      return !cerradas.has(salida);
    });

  } catch (error) {
    console.error("ERROR BLOQUEOS SALIDAS:", error);
    return res.status(503).json({
      ok: false,
      error: "No se pudo verificar la disponibilidad"
    });
  }

  resultado = filtrarPorTiempo(resultado, fecha);

  res.json({
    horarios: resultado
  });
});

app.get("/estudiante", (req, res) => {
  const rut = req.query.rut;

  const estudiante = estudiantes[rut];

  if (estudiante) {
    res.json({
      ok: true,
      estudiante
    });
  } else {
    res.json({
      ok: false
    });
  }
});


// 🔥 OBTENER TARIFA
app.get("/tarifa", (req, res) => {
  const { origen, destino } = req.query;

  const clave = `${origen}_${destino}`;
  const precio = tarifas[clave];

  res.json({
    precio: precio || "No disponible"
  });
});


// 🪑 ASIENTOS
app.get("/asientos", async (req, res) => {
  try {
    const { fecha, hora } = req.query;

    const { data, error } = await supabase
      .from("bloqueos")
      .select("asiento")
      .eq("fecha", fecha)
      .eq("hora", hora)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

    if (error) {
      console.log("ERROR SUPABASE:", error);
      return res.json([]);
    }

    const ocupados = data.map(v => v.asiento);

    const asientos = [];
    for (let i = 1; i <= 29; i++) {
      asientos.push({
        numero: i,
        ocupado: ocupados.includes(i)
      });
    }

    res.json(asientos);

  } catch (err) {
    console.log("ERROR /asientos:", err);
    res.json([]);
  }
});


// ⏳ RESERVA TEMPORAL


app.post("/reservar", async (req, res) => {
  try {
    const { asiento, fecha, hora } = req.body;
    const numero = Number(asiento);

    if (
      !Number.isInteger(numero) ||
      numero < 1 ||
      numero > 29
    ) {
      return res.status(400).json({
        ok: false,
        error: "Asiento inválido."
      });
    }

    if (
      typeof fecha !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
      typeof hora !== "string" ||
      !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hora)
    ) {
      return res.status(400).json({
        ok: false,
        error: "Fecha u horario inválido."
      });
    }

    const { data, error } = await supabase.rpc(
      "reservar_asiento_seguro",
      {
        p_asiento: numero,
        p_fecha: fecha,
        p_hora: hora
      }
    );

    if (error) throw error;

    if (data !== true) {
      return res.status(409).json({
        ok: false,
        error: "El asiento ya está ocupado o los datos son inválidos."
      });
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error("ERROR RESERVA:", error);

    return res.status(500).json({
      ok: false,
      error: "No se pudo reservar el asiento."
    });
  }
});


app.post("/comprar", async (req, res) => {
  const { fecha, hora, asiento } = req.body;

  if (!fecha || !hora || !asiento) {
    return res.json({ ok: false, error: "Faltan datos" });
  }

  guardarVenta(fecha, hora, asiento);
  
  enviarCorreoSMTP(correo, "", "", "", fecha, hora, asiento);
  
  res.json({ ok: true });
});

// Enlaces administrativos antiguos deshabilitados.
// El control se realizará desde el panel privado.


// CONSULTA PUBLICA DE PASE ESCOLAR
const consultasEstudiantes = new Map();

app.post("/api/estudiantes/consultar", async (req, res) => {
  const ip = req.ip || "desconocida";
  const ahora = Date.now();
  const registro = consultasEstudiantes.get(ip) || {
    cantidad: 0,
    inicio: ahora
  };

  if (ahora - registro.inicio > 60000) {
    registro.cantidad = 0;
    registro.inicio = ahora;
  }

  registro.cantidad++;
  consultasEstudiantes.set(ip, registro);

  if (registro.cantidad > 10) {
    return res.status(429).json({
      ok: false,
      mensaje: "Demasiados intentos. Espera un minuto."
    });
  }

  try {
    const { validarEstudiante } = require("./validar-estudiante");

    const pase = await validarEstudiante(
      supabase,
      req.body.rut
    );

    return res.json({
      ok: true,
      nombre: pase.nombre,
      origen: pase.origen,
      destino: pase.destino,
      precio: pase.precio
    });

  } catch (error) {
    if (error.message === "RUT inválido.") {
      return res.status(400).json({
        ok: false,
        mensaje: "Revisa el RUT ingresado."
      });
    }

    if (
      error.message === "Pase escolar no registrado." ||
      error.message === "Pase escolar no habilitado." ||
      error.message === "Pase escolar vencido."
    ) {
      return res.status(403).json({
        ok: false,
        mensaje: "Pase no disponible. Consulta con VientoSur."
      });
    }

    console.error("CONSULTA PASE:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo consultar el pase."
    });
  }
});

app.post("/api/estudiantes/verificar-compra", async (req, res) => {
  try {
    const { rut, fecha, origen, destino } = req.body;

    if (
      typeof rut !== "string" ||
      !/^[0-9.kK-]{7,14}$/.test(rut) ||
      typeof fecha !== "string" ||
      !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha) ||
      typeof origen !== "string" ||
      typeof destino !== "string"
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Datos de consulta invalidos."
      });
    }

    const rutNormalizado = rut.replace(/[^0-9kK]/g, "").toUpperCase();

    const { data, error } = await supabase
      .from("ventas")
      .select("id")
      .eq("tipo_pasaje", "estudiante")
      .eq("rut_estudiante", rutNormalizado)
      .eq("fecha", fecha)
      .eq("ruta", origen + " - " + destino)
      .eq("estado", "pagado")
      .limit(1);

    if (error) throw error;

    return res.json({
      ok: true,
      ya_compro: Array.isArray(data) && data.length > 0
    });

  } catch (error) {
    console.error("ERROR VERIFICANDO COMPRA ESTUDIANTE:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "No se pudo verificar la compra."
    });
  }
});

app.post("/pagar", async (req, res) => {
  try {
    const { nombre, correo, origen, destino, fecha, hora, asiento } = req.body;
   
    const clave = `${origen}_${destino}`;


    const numeroAsiento = Number(asiento);

    if (!Number.isInteger(numeroAsiento) ||
        numeroAsiento < 1 || numeroAsiento > 29) {
      return res.status(400).json({
        error: "Asiento invalido"
      });
    }

    if (typeof fecha !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        typeof hora !== "string" ||
        !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hora)) {
      return res.status(400).json({
        error: "Fecha u horario invalido"
      });
    }

    const partesFecha = fecha.split("-").map(Number);
    const diaSemana = new Date(Date.UTC(
      partesFecha[0], partesFecha[1] - 1, partesFecha[2]
    )).getUTCDay();

    const dia = diaSemana === 0 ? "domingo" :
      diaSemana === 6 ? "sabado" : "semana";

    const parametros = new URLSearchParams({
      dia, origen, destino, fecha
    });

    const urlBase = req.protocol + "://" + req.get("host");
    const respuestaHorarios = await fetch(
      urlBase + "/horarios?" + parametros.toString()
    );

    if (!respuestaHorarios.ok) {
      return res.status(503).json({
        error: "No se pudo verificar el horario"
      });
    }

    const datosHorarios = await respuestaHorarios.json();
    const lista = datosHorarios.horarios || [];

    if (!lista.some(item =>
      String(typeof item === "string" ? item : item.hora) === String(hora)
    )) {
      return res.status(400).json({
        error: "Horario no disponible"
      });
    }

    let precio = tarifas[clave];

    if (req.body.tipo_pasaje === "estudiante") {
      const { validarEstudiante } = require("./validar-estudiante");

      const pase = await validarEstudiante(
        supabase,
        req.body.rut_estudiante,
        origen,
        destino
      );

      precio = pase.precio;
    }

    
    if (!precio) {
      return res.status(400).json({ error: "Ruta sin tarifa" });
    }
    if (!fecha || !hora || !asiento) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    if (req.body.tipo_pasaje === "estudiante") {
      const rut = String(req.body.rut_estudiante || "")
        .replace(/[^0-9kK]/g, "").toUpperCase();

      const { data: compras, error: errorCompras } = await supabase
        .from("ventas")
        .select("rut_estudiante")
        .eq("tipo_pasaje", "estudiante")
        .eq("fecha", fecha)
        .eq("ruta", origen + " - " + destino)
        .eq("estado", "pagado");

      if (errorCompras) throw errorCompras;

      const yaCompro = (compras || []).some(v =>
        String(v.rut_estudiante || "")
          .replace(/[^0-9kK]/g, "").toUpperCase() === rut
      );

      if (yaCompro) {
        return res.status(409).json({
          error: "Ya compraste un pasaje estudiantil para este dia y sentido."
        });
      }
    }

    const preference = {
      items: [
        {
          title:`Pasaje ${nombre || "Pasajero"} - Asiento ${asiento}`,
          unit_price: Number(precio),
          quantity: 1,
          currency_id: "CLP"
        }
      ],

      external_reference: JSON.stringify({
        asiento,
        fecha,
        hora,
        nombre,
        correo,
        origen,
        destino,
        tipo_pasaje: req.body.tipo_pasaje === "estudiante" ? "estudiante" : "adulto",
        rut_estudiante: req.body.tipo_pasaje === "estudiante" ? req.body.rut_estudiante : null
      }),

      notification_url: "https://buses-vientosur.onrender.com/webhook",
      back_urls: {
        success: "https://busesvientosur.cl/",
        failure: "https://buses-vientosur.onrender.com/error.html",
        pending: "https://buses-vientosur.onrender.com/pendiente.html"
      },
      auto_return: "approved"
    };

    const preferenceClient = new Preference(client);

    const response = await preferenceClient.create({
      body: preference
    });


    res.json({
      init_point: response.init_point
    });

  } catch (error) {
    console.log("ERROR PAGO:", error);
    res.status(500).json({ error: "Error en pago" });
  }
});

app.get("/asientos", async (req, res) => {
  const { fecha, hora } = req.query;

  const { data, error } = await supabase
    .from("bloqueos")
    .select("asiento")
    .eq("fecha", fecha)
    .eq("hora", hora);

  if (error) {
    console.log("ERROR BLOQUEOS:", error);
    return res.status(500).json({ error: "error consultando bloqueos" });
  }

  res.json({
    ocupados: data.map(a => a.asiento)
  });
});

app.get("/bus", async (req, res) => {
  const { fecha, hora } = req.query;

  try {
    const { data, error } = await supabase
      .from("ventas")
      .select("*")
      .eq("fecha", fecha)
      .gte("hora", hora)
      .lt("hora", hora + ":59");

    if (error) {
      console.log("ERROR BUS:", error);
      return res.json([]);
    }

    res.json(data || []);
  } catch (err) {
    console.log("ERROR GENERAL:", err);
    res.json([]);
  }
});

app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;

    console.log("WEBHOOK RECIBIDO:", data);

    if (data.type === "payment" || data.action === "payment.created") {
      const paymentId = data.data.id;

      const { Payment } = require("mercadopago");
      const paymentClient = new Payment(client);

      const payment = await paymentClient.get({ id: paymentId });

      const datos = JSON.parse(payment.external_reference || "{}");

      if (payment.status !== "approved") {
        return res.sendStatus(200);
      }

      // Evitar reprocesar pagos ya registrados.
      const { data: ventaExistente, error: errorConsulta } = await supabase
        .from("ventas")
        .select("id")
        .eq("pago_id", String(paymentId))
        .maybeSingle();

      if (errorConsulta) {
        console.error("ERROR CONSULTANDO PAGO:", errorConsulta);
        return res.sendStatus(500);
      }

      if (ventaExistente) {
        console.log(
          "PAGO YA REGISTRADO - SIN DUPLICAR BOLETO:",
          paymentId
        );

        // Los correos pendientes los gestiona el proceso automático.
        // No generar otro QR, venta ni correo desde este webhook.
        return res.sendStatus(200);
      }

      const crypto = require("crypto");

      const codigoQR = crypto.randomBytes(24).toString("hex");

      const { data: venta, error } = await supabase.rpc(
        "registrar_boleto_pagado",
        {
          p_pago_id: String(paymentId),
          p_codigo_qr: codigoQR,
          p_asiento: Number(datos.asiento),
          p_fecha: datos.fecha,
          p_hora: datos.hora,
          p_ruta: datos.origen + " - " + datos.destino,
          p_nombre: datos.nombre || null,
          p_precio: Number(payment.transaction_amount),
          p_tipo_pasaje: datos.tipo_pasaje === "estudiante" ? "estudiante" : "adulto",
          p_rut_estudiante: datos.tipo_pasaje === "estudiante"
            ? String(datos.rut_estudiante || "").replace(/[^0-9kK]/g, "").toUpperCase()
            : null
        }
      );

      if (error) {
        console.error("ERROR REGISTRANDO BOLETO:", error);
        return res.sendStatus(500);
      }

      const codigoQRReal = venta.codigo_qr;

      // Guardar el destinatario inmediatamente después de registrar la venta.
      const { error: errorCorreoInicial } = await supabase
        .from("ventas")
        .update({
          correo_destino: datos.correo,
          correo_intentos: 1,
          correo_proximo_intento_at:
            new Date(Date.now() + 2 * 60000).toISOString()
        })
        .eq("pago_id", String(paymentId))
        .is("correo_enviado_at", null);

      if (errorCorreoInicial) {
        console.error("ERROR GUARDANDO CORREO:", errorCorreoInicial);
        return res.sendStatus(500);
      }


// 🔒 BLOQUEAR TODO EL BUS
datos.hora = datos.hora.slice(0,5);
// 1. buscar bus de la hora comprada
const origenPasajero = datos.origen;
const destinoPasajero = datos.destino;
// Convertir paradas intermedias al recorrido principal
if (
  datos.origen === "Temuco" &&
  ["Lolen", "Paradero21", "LasDichas", "Limite", "BarrosArana", "Paradero31", "TeodoroSchmidt", "Hualpin"].includes(datos.destino)
) {
  datos.destino = "Tolten";
}

if (
  datos.destino === "Temuco" &&
  ["Lolen", "Paradero21", "LasDichas", "Limite", "BarrosArana", "Paradero31", "TeodoroSchmidt", "Hualpin"].includes(datos.origen)
) {
  datos.origen = "Tolten";
}
if (datos.destino === "Pitrufquen") {
  datos.destino = "Temuco";
}


const sentido = `${datos.origen}_${datos.destino}`.replace(/\s+/g, "");

const { data: busData } = await supabase
  .from("mapa_buses")
  .select("bus_id")
  .eq("hora", datos.hora)
  .eq("sentido", sentido)
  .single();

if (!busData) {
  console.log("NO SE ENCONTRÓ BUS:", datos.hora);
  return res.sendStatus(200);
}


// 2. traer todas las horas de ese bus
const { data: horasBus } = await supabase
  .from("mapa_buses")
  .select("hora")
  .eq("bus_id", busData.bus_id);

// 3. crear bloqueos
const bloqueos = horasBus.map(h => ({
  asiento: Number(datos.asiento),
  fecha: datos.fecha,
  hora: h.hora
}));

// 4. guardar bloqueos
await supabase.from("bloqueos").insert(bloqueos);


      if (error) console.log("ERROR SUPABASE:", error);

      // Reservar el correo para evitar envíos duplicados.
      const { data: correoReservado, error: errorReserva } =
        await supabase.rpc("reservar_correo_boleto", {
          p_pago_id: String(paymentId)
        });

      if (errorReserva) {
        console.error("ERROR RESERVANDO CORREO:", errorReserva);
        return res.sendStatus(500);
      }

      if (correoReservado === true) {
        const correoAceptado = await enviarCorreoSMTP(
          datos.correo,
          datos.nombre,
          origenPasajero,
          destinoPasajero,
          datos.fecha,
          datos.hora,
          datos.asiento,
          codigoQRReal,
          paymentId,
          0,
          Number(payment.transaction_amount),
          datos.tipo_pasaje === "estudiante" ? "estudiante" : "adulto"
        );

        if (correoAceptado === true) {
          const { error: errorConfirmacion } = await supabase
            .from("ventas")
            .update({
              correo_enviado_at: new Date().toISOString()
            })
            .eq("pago_id", String(paymentId));

          if (errorConfirmacion) {
            console.error("ERROR CONFIRMANDO CORREO:", errorConfirmacion);
          } else {
            console.log("CORREO REGISTRADO EN SUPABASE:", paymentId);
          }
        } else {
          console.error("CORREO PENDIENTE DE REENVIO:", paymentId);

          const proximoIntento = new Date(
            Date.now() + 2 * 60 * 1000
          ).toISOString();

          const { error: errorReintento } = await supabase
            .from("ventas")
            .update({
              correo_intentos: 1,
              correo_proximo_intento_at: proximoIntento
            })
            .eq("pago_id", String(paymentId))
            .is("correo_enviado_at", null);

          if (errorReintento) {
            console.error("ERROR PROGRAMANDO REINTENTO:", errorReintento);
          }
        }
      } else {
        console.log("CORREO YA RESERVADO:", paymentId);
      }

      await fetch("https://script.google.com/macros/s/AKfycbwXAjjmKEZ4jqj3f58MmifBTgRqT9nKxyuQ9tT1C3vPN44ka-K1PRMAkTZR1s3Ft__7/exec", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fecha: datos.fecha,
          hora: datos.hora,
          asiento: datos.asiento,
          nombre: datos.nombre,
          pago_id: paymentId
        })
      });

      return res.sendStatus(200);
    }

    res.sendStatus(200);

  } catch (error) {
    console.log("ERROR WEBHOOK:", error);
    res.sendStatus(500);
  }
});
   

    


// 🚀 INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;


// AUTENTICACION PASAJEROS VIENTOSUR
function clienteAuthVientoSur() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );
}

const intentosAuth = new Map();

function limitarAuth(req, res, next) {
  const ahora = Date.now();
  const ip = req.ip;
  const anterior = intentosAuth.get(ip) || {
    inicio: ahora,
    cantidad: 0
  };

  if (ahora - anterior.inicio > 15 * 60 * 1000) {
    anterior.inicio = ahora;
    anterior.cantidad = 0;
  }

  anterior.cantidad++;
  intentosAuth.set(ip, anterior);

  if (anterior.cantidad > 30) {
    return res.status(429).json({
      ok: false,
      mensaje: "Demasiados intentos. Prueba más tarde."
    });
  }

  next();
}

app.post("/api/auth/registro", limitarAuth, async (req, res) => {
  try {
    const { nombre, telefono, correo, password } = req.body || {};

    if (
      typeof nombre !== "string" ||
      nombre.trim().length < 3 ||
      nombre.length > 100 ||
      typeof telefono !== "string" ||
      !/^\+?[0-9 ]{8,16}$/.test(telefono.trim()) ||
      typeof correo !== "string" ||
      correo.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim()) ||
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 128
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Revisa los datos. La contraseña debe tener al menos 10 caracteres."
      });
    }

    const auth = clienteAuthVientoSur();

    const { error } = await auth.auth.signUp({
      email: correo.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: "https://busesvientosur.cl/login.html",
        data: {
          nombre: nombre.trim(),
          telefono: telefono.trim()
        }
      }
    });

    if (error) {
      console.error("Error registro VientoSur:", error.code);
      return res.status(error.status === 429 ? 429 : 400).json({
        ok: false,
        mensaje: error.status === 429
          ? "Demasiados intentos de registro. Por seguridad, espera aproximadamente 1 minuto antes de volver a intentarlo. Revisa también tu correo, porque podrías haber recibido el enlace de confirmación."
          : "No se pudo completar el registro. Revisa los datos."
      });
    }

    res.json({
      ok: true,
      mensaje: "Revisa tu correo y confirma tu cuenta antes de ingresar."
    });
  } catch (error) {
    console.error("Error interno registro:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "No se pudo procesar el registro."
    });
  }
});



app.get("/api/auth/configuracion", (req, res) => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    return res.status(503).json({
      ok: false,
      mensaje: "Recuperación no configurada."
    });
  }

  res.set("Cache-Control", "no-store");
  res.json({ url, anonKey });
});

app.post("/api/auth/recuperar", limitarAuth, async (req, res) => {
  try {
    const correo = String(req.body?.correo || "").trim().toLowerCase();

    if (correo.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Ingresa un correo válido."
      });
    }

    const auth = clienteAuthVientoSur();

    const { error } = await auth.auth.resetPasswordForEmail(correo, {
      redirectTo: "https://busesvientosur.cl/recuperar.html"
    });

    if (error) console.error("Recuperación:", error.message);

    res.json({
      ok: true,
      mensaje: "Si el correo está registrado, recibirás un enlace para recuperar tu contraseña."
    });
  } catch (error) {
    console.error("Error recuperación:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "No se pudo procesar la solicitud."
    });
  }
});

app.post("/api/auth/login", limitarAuth, async (req, res) => {
  try {
    const { correo, password } = req.body || {};

    if (
      typeof correo !== "string" ||
      correo.length > 254 ||
      typeof password !== "string" ||
      password.length > 128
    ) {
      return res.status(400).json({
        ok: false,
        mensaje: "Datos de acceso inválidos."
      });
    }

    const auth = clienteAuthVientoSur();

    const { data, error } = await auth.auth.signInWithPassword({
      email: correo.trim().toLowerCase(),
      password
    });

    if (error || !data.session) {
      return res.status(401).json({
        ok: false,
        mensaje: "Revisa tu correo, contraseña y confirmación de cuenta."
      });
    }

    res.json({
      ok: true,
      token: data.session.access_token,
      usuario: {
        id: data.user.id,
        nombre: data.user.user_metadata?.nombre || "",
        correo: data.user.email
      }
    });
  } catch (error) {
    console.error("Error interno login:", error.message);
    res.status(500).json({
      ok: false,
      mensaje: "No se pudo iniciar sesión."
    });
  }
});



// SEGUIMIENTO PRIVADO POR CUENTA Y BOLETO PAGADO
function distanciaEntreGPS(a,b,c,d) {
  const rad = n => n * Math.PI / 180;
  const x = Math.sin(rad(c-a)/2)**2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) *
    Math.sin(rad(d-b)/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,x)));
}

const { calcularLlegadaBus } = require("./calcular-llegada-bus");

const movimientosSeguimiento = new Map();

app.post("/api/seguir-mi-bus/consultar", async (req,res) => {
  res.set("Cache-Control","no-store");

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim() : "";

    if (!token) {
      return res.status(401).json({
        ok:false,
        mensaje:"Primero inicia sesion en VientoSur."
      });
    }

    const auth = clienteAuthVientoSur();
    const {data:sesion,error:errorAuth} =
      await auth.auth.getUser(token);

    if (errorAuth || !sesion?.user?.email) {
      return res.status(401).json({
        ok:false,
        mensaje:"Tu sesion vencio. Vuelve a ingresar."
      });
    }

    const codigo = String(req.body?.codigo || "")
      .trim().toLowerCase();

    const lat = Number(req.body?.latitud);
    const lon = Number(req.body?.longitud);

    if (!/^[a-f0-9]{48}$/.test(codigo) ||
        req.body?.latitud == null ||
        req.body?.longitud == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat)>90 ||
        Math.abs(lon)>180) {
      return res.status(400).json({
        ok:false,
        mensaje:"Codigo de boleto o GPS invalido."
      });
    }

    const correo = sesion.user.email.trim().toLowerCase();

    const {data:venta,error:errorVenta} = await supabase
      .from("ventas")
      .select("fecha,hora,ruta,correo_destino")
      .eq("codigo_qr",codigo)
      .eq("estado","pagado")
      .maybeSingle();

    if (errorVenta) throw errorVenta;

    if (!venta ||
        String(venta.correo_destino||"")
          .trim().toLowerCase() !== correo) {
      return res.status(403).json({
        ok:false,
        mensaje:"Este boleto no corresponde a tu cuenta o no esta pagado."
      });
    }

    const hoy = new Intl.DateTimeFormat("en-CA",{
      timeZone:"America/Santiago",
      year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date());

    if (String(venta.fecha).slice(0,10) !== hoy) {
      return res.json({
        ok:true,
        estado:"esperando",
        mensaje:"Puedes seguir tu bus solamente el dia del viaje."
      });
    }

    const ruta = String(venta.ruta || "").split(/\s+-\s+/);

    if (ruta.length !== 2) {
      return res.json({
        ok:true,
        estado:"esperando",
        mensaje:"No se pudo identificar la ruta de tu boleto."
      });
    }

    const {data:buses,error:errorBuses} = await supabase
      .from("recorridos_conductor")
      .select("latitud,longitud,gps_actualizado_at")
      .eq("fecha",hoy)
      .eq("hora",String(venta.hora).slice(0,5))
      .eq("origen",ruta[0])
      .eq("destino",ruta[1])
      .eq("estado","activo")
      .limit(2);

    if (errorBuses) throw errorBuses;

    if (!buses?.length) {
      return res.json({
        ok:true,
        estado:"esperando",
        mensaje:"El conductor aun no inicia este recorrido."
      });
    }

    if (buses.length !== 1) {
      return res.json({
        ok:true,
        estado:"esperando",
        mensaje:"Hay varios buses en este horario. No podemos identificar el tuyo."
      });
    }

    const bus = buses[0];
    const actualizado = Date.parse(bus.gps_actualizado_at || "");

    if (bus.latitud == null ||
        bus.longitud == null ||
        !Number.isFinite(actualizado) ||
        Math.abs(Date.now()-actualizado)>120000) {
      return res.json({
        ok:true,
        estado:"sin_gps",
        mensaje:"El bus esta en recorrido, pero su GPS no esta actualizado."
      });
    }




    // Distancia aproximada entre ambos GPS
    const distancia = distanciaEntreGPS(
      lat,
      lon,
      Number(bus.latitud),
      Number(bus.longitud)
    );

    if (!Number.isFinite(distancia)) {
      return res.json({
        ok: true,
        estado: "sin_gps",
        mensaje: "No se pudo calcular la ubicacion."
      });
    }

    // Verificar movimiento del bus antes de estimar llegada
    const claveSeguimiento = codigo;
    const anterior = movimientosSeguimiento.get(claveSeguimiento);
    const ahora = Date.now();

    movimientosSeguimiento.set(claveSeguimiento, {
      distancia,
      gpsFecha: actualizado,
      hora: ahora
    });

    if (movimientosSeguimiento.size > 1000) {
      movimientosSeguimiento.clear();
    }

    if (
      !anterior ||
      ahora - anterior.hora > 180000 ||
      actualizado <= anterior.gpsFecha
    ) {
      return res.json({
        ok: true,
        estado: "en_recorrido",
        mensaje: "Bus en recorrido. Calculando si se acerca a tu ubicacion..."
      });
    }

    const diferencia = anterior.distancia - distancia;

    if (diferencia < -0.1) {
      return res.json({
        ok: true,
        estado: "en_recorrido",
        mensaje: "El bus se esta alejando de tu ubicacion. No podemos confirmar si ya paso."
      });
    }

    if (diferencia < 0.05) {
      return res.json({
        ok: true,
        estado: "en_recorrido",
        mensaje: "El bus esta detenido o todavia no podemos confirmar que se acerque."
      });
    }

    const minutos = Math.max(1, Math.ceil(distancia / 30 * 60));

    return res.json({
      ok: true,
      estado: "activo",
      minutos,
      mensaje: "Tiempo orientativo. El camino, las curvas y las paradas pueden cambiar la llegada."
    });

  } catch(error) {
    console.error("ERROR SEGUIR MI BUS:",error);
    return res.status(500).json({
      ok:false,
      mensaje:"No se pudo consultar el seguimiento."
    });
  }
});

app.get("/api/auth/yo", async (req, res) => {
  try {
    const encabezado = req.headers.authorization || "";
    const token = encabezado.startsWith("Bearer ")
      ? encabezado.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({ ok: false });
    }

    const auth = clienteAuthVientoSur();
    const { data, error } = await auth.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ ok: false });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      usuario: {
        id: data.user.id,
        nombre: data.user.user_metadata?.nombre || "",
        correo: data.user.email
      }
    });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});


// REINTENTOS AUTOMATICOS DE BOLETOS
let reintentosEnProceso = false;

async function procesarReintentosBoletos() {
  if (reintentosEnProceso) return;
  reintentosEnProceso = true;

  try {
    const { data: pendientes, error } = await supabase
      .rpc("obtener_correos_pendientes");

    if (error) throw error;

    for (const venta of pendientes || []) {
      let reservado = false;

      try {
        const resultado = await supabase.rpc(
          "reservar_correo_boleto",
          { p_pago_id: venta.pago_id }
        );

        if (resultado.error || resultado.data !== true) continue;
        reservado = true;

        const { Payment } = require("mercadopago");
        const paymentClient = new Payment(client);

        const pago = await paymentClient.get({
          id: venta.pago_id
        });

        if (pago.status !== "approved") {
          throw new Error("Pago no confirmado");
        }

        const datos = JSON.parse(pago.external_reference || "{}");

        const enviado = await enviarCorreoSMTP(
          venta.correo_destino,
          datos.nombre,
          datos.origen,
          datos.destino,
          datos.fecha,
          datos.hora,
          datos.asiento,
          venta.codigo_qr,
          venta.pago_id,
          Number(venta.correo_intentos),
          Number(pago.transaction_amount),
          datos.tipo_pasaje === "estudiante" ? "estudiante" : "adulto"
        );

        if (!enviado) throw new Error("Fallo envio Resend");

        const { error: errorConfirmacion } = await supabase
          .from("ventas")
          .update({
            correo_enviado_at: new Date().toISOString(),
            correo_proximo_intento_at: null
          })
          .eq("id", venta.id)
          .is("correo_enviado_at", null);

        if (errorConfirmacion) throw errorConfirmacion;

        console.log("BOLETO REENVIADO:", venta.pago_id);

      } catch (errorVenta) {
        console.error("ERROR REINTENTANDO BOLETO:", errorVenta);

        if (!reservado) continue;

        const intentos = Number(venta.correo_intentos) + 1;
        const minutos = intentos === 2 ? 3 : intentos === 3 ? 10 : 0;

        const proximo = minutos
          ? new Date(Date.now() + minutos * 60000).toISOString()
          : null;

        const { error: errorActualizacion } = await supabase
          .from("ventas")
          .update({
            correo_intentos: intentos,
            correo_proximo_intento_at: proximo
          })
          .eq("id", venta.id)
          .is("correo_enviado_at", null);

        if (errorActualizacion) {
          console.error("ERROR ACTUALIZANDO REINTENTO:", errorActualizacion);
        }
      }
    }
  } catch (errorGeneral) {
    console.error("ERROR GENERAL DE REINTENTOS:", errorGeneral);
  } finally {
    reintentosEnProceso = false;
  }
}

setInterval(procesarReintentosBoletos, 30000);


// BIENVENIDA VIENTOSUR - EJECUCION CONTROLADA
const servicioBienvenida = crearServicioBienvenida(supabase);

async function procesarBienvenidasMasivas() {
  if (process.env.BIENVENIDAS_MASIVAS !== "true") {
    console.log("BIENVENIDAS MASIVAS DESACTIVADAS");
    return;
  }

  const auth = clienteAuthVientoSur();
  let pagina = 1;
  let enviados = 0;
  let omitidos = 0;

  while (true) {
    const { data, error } = await auth.auth.admin.listUsers({
      page: pagina,
      perPage: 100
    });

    if (error) {
      console.error("ERROR LISTANDO USUARIOS:", error.message);
      break;
    }

    const usuarios = data?.users || [];

    for (const usuario of usuarios) {
      try {
        const resultado = await servicioBienvenida.enviarBienvenida(usuario);
        if (resultado.enviado) enviados++;
        else omitidos++;
      } catch (errorEnvio) {
        console.error("ERROR BIENVENIDA:", errorEnvio.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    if (usuarios.length < 100) break;
    pagina++;
  }

  console.log("BIENVENIDAS FINALIZADAS:", { enviados, omitidos });
}

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
                    

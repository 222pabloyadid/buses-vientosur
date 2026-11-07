

const express = require("express");
const cors = require("cors");
const fs = require('fs');
const PDFDocument = require("pdfkit");
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

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
const resend = new Resend(process.env.RESEND_API_KEY);


async function enviarCorreoSMTP(correo, nombre, origen, destino, fecha, hora, asiento) {
  console.log("📧 Enviando correo a:", correo);

  try {
    // generar PDF
    const archivoPDF = await generarPDF(nombre, origen, destino, fecha, hora, asiento);

    await resend.emails.send({
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
      `,
      attachments: [
        {
          filename: "boleto.pdf",
          content: require("fs").readFileSync(archivoPDF)
        }
      ]
    });

    console.log(" CORREO ENVIADO");
  } catch (error) {
    console.log(" ERROR CORREO:", error);
  }
}
 

function generarPDF(nombre, origen, destino, fecha, hora, asiento) {
  return new Promise((resolve, reject) => {
    const path = require("path");
    const file = path.join(
      require("os").tmpdir(),
      "boleto_" + Date.now() + "_" +
      require("crypto").randomBytes(4).toString("hex") + ".pdf"
    );

    const doc = new PDFDocument({
      size: [340, 490],
      margin: 0,
      autoFirstPage: true
    });

    const stream = fs.createWriteStream(file);
    doc.pipe(stream);

    stream.on("finish", () => resolve(file));
    stream.on("error", reject);
    doc.on("error", reject);

    // Fondo y encabezado
    doc.rect(0, 0, 340, 490).fill("#f1f5f9");
    doc.roundedRect(12, 12, 316, 466, 12).fill("#ffffff");
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

    doc.roundedRect(28, 424, 284, 32, 6).fill("#e8f4f8");

    doc.fillColor("#103b70")
       .font("Helvetica-Bold")
       .fontSize(10)
       .text("Gracias por viajar con VientoSur", 35, 434, {
         width: 270,
         align: "center"
       });

    doc.end();
  });
}

app.use(cors({
  origin: ["https://busesvientosur.cl", "https://www.busesvientosur.cl"],
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

app.use(express.static("public"));
app.use(express.static(__dirname));

// IMPORTAR ARCHIVOS
const horarios = require("./horarios.js");
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
app.get("/horarios", (req, res) => {
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
resultado = resultado.filter(h => {
  const horaStr = typeof h === "string" ? h : h.hora;
  return !bloqueados.includes(horaStr);
  
});

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
  const { asiento, fecha, hora } = req.body;

  console.log("RESERVANDO:", asiento, fecha, hora);
  const expira = new Date(Date.now() + 2 * 60 * 1000);

  const { error } = await supabase.from("bloqueos").insert([
    {
      asiento,
      fecha,
      hora,
      expires_at: expira
    }
  ]);

  if (error) {
    console.log("ERROR RESERVA:", error);
    return res.status(500).json({ error: "error reservando" });
  }

  res.json({ ok: true });
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

app.get("/admin/bloquear", async (req, res) => {
  const { hora, key } = req.query;

  if (key !== "1234") {
    return res.json({ ok: false, error: "No autorizado" });
  }

  if (!hora) {
    return res.json({ ok: false, error: "Falta hora" });
  }

  if (!bloqueados.includes(hora)) {
    await supabase
      .from("horarios_bloqueados")
      .insert({ hora });
  
    await cargarBloqueos();
  }
  
  
  res.json({ ok: true, bloqueados });
});

app.get("/admin/desbloquear", async (req, res) => {
  const { hora, key } = req.query;

  if (key !== "1234") {
    return res.json({ ok: false, error: "No autorizado" });
}

  await supabase
    .from("horarios_bloqueados")
    .delete()
    .eq("hora", hora);

  await cargarBloqueos();

  res.json({ ok: true, bloqueados });
});

app.post("/pagar", async (req, res) => {
  try {
    const { nombre, correo, origen, destino, fecha, hora, asiento } = req.body;
   
    const clave = `${origen}_${destino}`;
    const precio = tarifas[clave];
    
    if (!precio) {
      return res.status(400).json({ error: "Ruta sin tarifa" });
    }
    if (!fecha || !hora || !asiento) {
      return res.status(400).json({ error: "Faltan datos" });
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
        destino
      }),

      notification_url: "https://buses-vientosur.onrender.com/webhook",
      back_urls: {
        success: `https://buses-vientosur.onrender.com/boleto.html?nombre=${nombre}&correo=${correo}&origen=${origen}&destino=${destino}&fecha=${fecha}&hora=${hora}&asiento=${asiento}`,
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

      if (payment.status !== "approved") {
        return res.sendStatus(200);
      }

      const datos = JSON.parse(payment.external_reference || "{}");

      const { error } = await supabase.from("ventas").insert([
        {
          asiento: Number(datos.asiento),
          fecha: datos.fecha,
          hora: datos.hora,
          ruta: datos.origen + " - " + datos.destino,
          estado: "pagado"
        }
      ]);

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

      enviarCorreoSMTP(
        datos.correo,
        datos.nombre,
        origenPasajero,
        destinoPasajero,
        datos.fecha,
        datos.hora,
        datos.asiento
      );

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
          ? "Límite de registros alcanzado. Intenta más tarde."
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

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
                    

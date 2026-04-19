

const express = require("express");
const fs = require('fs');
const PDFDocument = require("pdfkit");
const generarPDF = require("./pdf");

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const bloqueados = require("./bloqueos");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


async function enviarCorreoSMTP(correo, nombre, origen, destino, fecha, hora, asiento) {
  console.log("📧 Enviando correo a:", correo);

  try {

    // 🧾 GENERAR PDF
    const archivo = await generarPDF({
      nombre,
      origen,
      destino,
      fecha,
      hora,
      asiento
    });

    // 📄 LEER PDF
    const pdfBuffer = require("fs").readFileSync(archivo);

    // 📧 HTML DEL CORREO
    const html = `
      <h2>🚌 Boleto Buses VientoSur</h2>
      <p>Gracias por preferir Buses VientoSur.</p>
      <p>Te deseamos un excelente viaje.</p>
      <hr/>
      <p><strong>Nombre:</strong> ${nombre}</p>
      <p><strong>Ruta:</strong> ${origen} - ${destino}</p>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Hora:</strong> ${hora}</p>
      <p><strong>Asiento:</strong> ${asiento}</p>
      <br/>
      <p>Preséntate 20 minutos antes de la salida.</p>
      <p>Este boleto es válido solo para el horario indicado.</p>
    `;

    // 📤 ENVIAR CORREO CON PDF
    await resend.emails.send({
      from: "Buses VientoSur <ventas@busesvientosur.cl>",
      to: correo,
      subject: "Tu pasaje Buses VientoSur",
      html: html,
      attachments: [
        {
          filename: "boleto.pdf",
          content: pdfBuffer.toString("base64")
        }
      ]
    });

    console.log("✅ CORREO ENVIADO CON PDF");

  } catch (error) {
    console.error("❌ ERROR enviando correo:", error);
  }
}
    


 


const { MercadoPagoConfig, Preference } = require("mercadopago");


const client = new MercadoPagoConfig({
  accessToken: "APP_USR-2721588281881648-040100-0789203df06a5beb26d5bb2bb90cab4d-51866980"
});

const app = express();
app.use(express.json());

app.use(express.static("public"));
app.use(express.static(__dirname));

// IMPORTAR ARCHIVOS
const horarios = require("./horarios.js");
const tarifas = require("./tarifas.js");
const estudiantes = require("./data/estudiantes");

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

// 💰 OBTENER TARIFA
app.get("/tarifa", (req, res) => {
  const { origen, destino } = req.query;

  const clave = `${origen}_${destino}`;
  const precio = tarifas[clave];

  res.json({
    precio: precio || "No disponible"
  });
});


// 🪑 ASIENTOS (29)
app.get("/asientos", async (req, res) => {
  try {
    const { fecha, hora } = req.query;

    const { data, error } = await supabase
      .from("ventas")
      .select("asiento")
      .eq("fecha", fecha)
      .eq("hora", hora);

    if (error) {
      console.log("ERROR SUPABASE:", error);
      return res.json([]);
    }

    const ocupados = data.map(v => v.asiento);

    console.log("OCUPADOS:", ocupados);

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

app.post("/comprar", async (req, res) => {
  const { fecha, hora, asiento } = req.body;

  if (!fecha || !hora || !asiento) {
    return res.json({ ok: false, error: "Faltan datos" });
  }

  guardarVenta(fecha, hora, asiento);
  
  enviarCorreoSMTP(correo, "", "", "", fecha, hora, asiento);
  
  res.json({ ok: true });
});

app.get("/admin/bloquear", (req, res) => {
  const { hora, key } = req.query;

  if (key !== "1234") {
    return res.json({ ok: false, error: "No autorizado" });
  }

  if (!hora) {
    return res.json({ ok: false, error: "Falta hora" });
  }

  if (!bloqueados.includes(hora)) {
    bloqueados.push(hora);
  }
  
  res.json({ ok: true, bloqueados });
});


app.get("/admin/desbloquear", (req, res) => {
  const { hora, key } = req.query;

  if (key !== "1234") {
    return res.json({ ok: false, error: "No autorizado" });
  }

  const index = bloqueados.indexOf(hora);
  if (index !== -1) {
    bloqueados.splice(index, 1);
  }

  res.json({ ok: true, bloqueados });
});

app.post("/pagar", async (req, res) => {
  try {
    const { nombre, correo, origen, destino, precio, fecha, hora, asiento } = req.body;

    if (!precio || !fecha || !hora || !asiento) {
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

app.get("/bus", async (req, res) => {
  const { fecha, hora } = req.query;

  try {
    const { data, error } = await supabase
      .from("ventas")
      .select("*")
      .eq("fecha", fecha)
      .like("hora", hora + "%");

    if (error) {
      console.log("ERROR:", error);
      return res.json([]);
    }

    res.json(data);

  } catch (err) {
    console.log("ERROR SERVER:", err);
    res.json([]);
  }
});
app.post("/bloquear", async (req, res) => {
  try {
    const { asiento, fecha, hora } = req.body;

    const ahora = new Date();

    // limpiar bloqueos vencidos
    await supabase.from("bloqueos").delete().lt("expires_at", ahora);

    // verificar si ya está bloqueado
    const { data } = await supabase
      .from("bloqueos")
      .select("*")
      .eq("asiento", asiento)
      .eq("fecha", fecha)
      .eq("hora", hora)
      .gt("expires_at", ahora);

    if (data.length > 0) {
      return res.status(400).json({ error: "Asiento ocupado" });
    }

    // guardar bloqueo por 2 minutos
    await supabase.from("bloqueos").insert([
      {
        asiento,
        fecha,
        hora,
        expires_at: new Date(Date.now() + 2 * 60 * 1000)
      }
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.log("ERROR BLOQUEO:", err);
    res.sendStatus(500);
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

      // VALIDACIÓN
      if (
        !datos.nombre ||
        !datos.origen ||
        !datos.destino ||
        !datos.fecha ||
        !datos.hora ||
        !datos.asiento ||
        !datos.correo
      ) {
        console.log("❌ DATOS INCOMPLETOS:", datos);
        return res.sendStatus(400);
      }

      // INSERT SUPABASE
      const { error } = await supabase.from("ventas").insert([
        {
          asiento: Number(datos.asiento),
          fecha: datos.fecha,
          hora: datos.hora,
          nombre: datos.nombre,
          ruta: `${datos.origen} - ${datos.destino}`,
          estado: "pagado"
        }
      ]);

      if (error) {
        console.log("❌ ERROR SUPABASE:", error.message);
        return res.sendStatus(500);
      }

      console.log("✅ GUARDADO EN SUPABASE");

      // CORREO
      enviarCorreoSMTP(
        datos.correo,
        datos.nombre,
        datos.origen,
        datos.destino,
        datos.fecha,
        datos.hora,
        datos.asiento
      );

      // FETCH (USA TU MISMA URL QUE YA TENÍAS)
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

    return res.sendStatus(200);
  } catch (error) {
    console.log("ERROR WEBHOOK:", error);
    return res.sendStatus(500);
  }
});
   
app.get("/test-pdf", async (req, res) => {
  console.log("ENTRO A TEST PDF");

  try {
    const archivo = await generarPDF({
      nombre: "Juan Perez",
      origen: "Tolten",
      destino: "Temuco",
      fecha: "2026-04-18",
      hora: "10:00",
      asiento: "5"
    });

    res.download(archivo);
  } catch (error) {
    console.log("ERROR PDF:", error);
    res.send("Error generando PDF");
  }
});
    


// 🚀 INICIAR SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
                    



const express = require("express");
const fs = require('fs');
const PDFDocument = require("pdfkit");
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);


const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);


async function enviarCorreoSMTP(correo, nombre, origen, destino, fecha, hora, asiento) {
  console.log("📨 Enviando correo a:", correo);

  try {
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
      `
    });

    console.log("✅ CORREO ENVIADO");
  } catch (error) {
    console.log("❌ ERROR CORREO:", error);
  }
}
 

function generarPDF(nombre, origen, destino, fecha, hora, asiento) {

  const file = "boleto_" + Date.now() + ".pdf";
  const doc = new PDFDocument();

  doc.pipe(fs.createWriteStream(file));

  doc.text("Buses VientoSur");
  doc.text("Nombre: " + nombre);
  doc.text("Ruta: " + origen + " - " + destino);
  doc.text("Fecha: " + fecha);
  doc.text("Hora: " + hora);
  doc.text("Asiento: " + asiento);

  doc.end();

  return file;
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
const bloqueados = require("./bloqueos.js");
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

app.get('/bus', (req, res) => {
    const { fecha, hora } = req.query;

    const ventas = JSON.parse(fs.readFileSync('ventas.json', 'utf8'));

    const filtrados = ventas.filter(v => 
      v.fecha == fecha && v.hora.substring(0,5) == hora.substring(0,5)
    );

    res.json(filtrados);
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

// 1. buscar bus de la hora comprada
const { data: busData } = await supabase
  .from("mapa_buses")
  .select("bus_id")
  .eq("hora", datos.hora)
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
        datos.origen,
        datos.destino,
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

app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto", PORT);
});
                    

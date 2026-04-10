

const express = require("express");
const fs = require('fs');
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);
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
const { guardarVenta, obtenerAsientosOcupados } = require("./ventas.js");



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
app.get("/asientos", (req, res) => {
const { fecha, hora } = req.query;
const ocupados = obtenerAsientosOcupados(fecha, hora);

console.log("OCUPADOS:", ocupados);

  const asientos = [];

  for (let i = 1; i <= 29; i++) {
    asientos.push({
      numero: i,
      ocupado: ocupados.includes(i)
    });
  }


  res.json(asientos);
});

app.post("/comprar", async (req, res) => {
  const { fecha, hora, asiento } = req.body;

  if (!fecha || !hora || !asiento) {
    return res.json({ ok: false, error: "Faltan datos" });
  }

  guardarVenta(fecha, hora, asiento);
  
  await resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'pasajes.busesvientosur@gmail.com',
  subject: 'Tu pasaje Buses VientoSur',
  html: `
    <h2>Compra confirmada ✅</h2>
    <p><strong>Fecha:</strong> ${fecha}</p>
    <p><strong>Hora:</strong> ${hora}</p>
    <p><strong>Asiento:</strong> ${asiento}</p>
  `
});
  
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
    const { nombre, precio, fecha, hora, asiento } = req.body;

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
      notification_url: "https://buses-vientosur.onrender.com/webhook",
      back_urls: {
        success:`https://buses-vientosur.onrender.com/exito.html?fecha=${fecha}&hora=${hora}&asiento=${asiento}`,
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

app.get('/bus', (req, res) => {
    const { fecha, hora } = req.query;

    const ventas = JSON.parse(fs.readFileSync('ventas.json', 'utf8'));

    const filtrados = ventas.filter(v => 
        v.fecha === fecha && v.hora === hora
    );

    res.json(filtrados);
});

app.post("/webhook", async (req, res) => {
    try {
        const data = req.body;

        console.log("WEBHOOK RECIBIDO:", data);

        // Solo procesar pagos
        if (data.data && data.data.id) {
            console.log("PAGO DETECTADO");

            const paymentId = data.data.id;

            const nuevaVenta = {
                asiento: Math.floor(Math.random() * 40) + 1,
                fecha: "2026-04-10",
                hora: "10:00",
                nombre: "Cliente Web",
                pago_id: paymentId
            };

            let ventas = [];
            try {
                ventas = JSON.parse(fs.readFileSync('ventas.json', 'utf8'));
            } catch (e) {
                ventas = [];
            }

            ventas.push(nuevaVenta);

            fs.writeFileSync('ventas.json', JSON.stringify(ventas, null, 2));

            console.log("VENTA GUARDADA:", nuevaVenta);
        }

        res.sendStatus(200);

    } catch (error) {
        console.log("ERROR WEBHOOK:", error);
        res.sendStatus(500);
    }
});
  
// 🚀 INICIAR SERVIDOR
app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});

const express = require("express");
const app = express();

// IMPORTAR ARCHIVOS
const horarios = require("./horarios.js");
const tarifas = require("./tarifas.js");

// CONFIG
app.use(express.json());

// RUTA PRINCIPAL
app.get("/", (req, res) => {
  res.send("App Buses funcionando 🚍");
});


// 🔎 BUSCAR HORARIOS
app.get("/horarios", (req, res) => {
  const { dia, origen, destino } = req.query;

  let tipoDia = "semana";

  if (dia === "sabado") tipoDia = "sabado";
  if (dia === "domingo") tipoDia = "domingo";

  let resultado = [];

  // HACIA TEMUCO (mostrar todos)
  if (destino === "Temuco") {
    resultado = [
      ...(horarios[tipoDia].Tolten_Temuco || []),
      ...(horarios[tipoDia].Hualpin_Temuco || []),
      ...(horarios[tipoDia].TeodoroSchmidt_Temuco || []),
      ...(horarios[tipoDia].BarrosArana_Temuco || []),
      ...(horarios[tipoDia].Pitrufquen_Temuco || [])
    ];
  } else {
    const clave = ${origen}_${destino};
    resultado = horarios[tipoDia][clave] || [];
  }

  res.json({
    horarios: resultado
  });
});


// 💰 OBTENER TARIFA
app.get("/tarifa", (req, res) => {
  const { origen, destino } = req.query;

  const clave = ${origen}_${destino};
  const precio = tarifas[clave];

  res.json({
    precio: precio || "No disponible"
  });
});


// 🪑 ASIENTOS (29)
app.get("/asientos", (req, res) => {
  const asientos = [];

  for (let i = 1; i <= 29; i++) {
    asientos.push({
      numero: i,
      ocupado: false
    });
  }

  res.json(asientos);
});


// 🚀 INICIAR SERVIDOR
app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function generarPDF() {

const file = "boleto_" + Date.now() + ".pdf";
const doc = new PDFDocument({ size: "A4", margin: 40 });

const stream = fs.createWriteStream(file);
doc.pipe(stream);

// fondo suave
doc.rect(0, 0, 600, 800).fill("#f4f6f8");
doc.fillColor("black");

// logo
try {
doc.image("logo.png", 230, 30, { width: 120 });
} catch (e) {}

// título
doc.moveDown(3);
doc.fontSize(22).text("E-TICKET", { align: "center" });
doc.fontSize(12).text("Buses VientoSur", { align: "center" });

doc.moveDown(0.5);
doc.fontSize(10).text("Presenta este boleto al abordar", { align: "center" });

// línea
doc.moveTo(40, 140).lineTo(555, 140).stroke();

// folio
const folio = "BS-" + Date.now();
doc.fontSize(10).text("N° RESERVA: " + folio, 40, 155);

// caja principal
doc.roundedRect(40, 180, 515, 140, 10).stroke();

// ORIGEN
doc.fontSize(9).text("ORIGEN", 60, 200);
doc.fontSize(12).text("Toltén", 60, 215);

// DESTINO
doc.fontSize(9).text("DESTINO", 60, 240);
doc.fontSize(12).text("Temuco", 60, 255);

// FECHA
doc.fontSize(9).text("FECHA", 240, 200);
doc.fontSize(12).text("2026-04-18", 240, 215);

// HORA SALIDA
doc.fontSize(9).text("SALIDA", 240, 240);
doc.fontSize(12).text("10:00", 240, 255);

// HORA LLEGADA (+2:30)
doc.fontSize(9).text("LLEGADA", 240, 280);
doc.fontSize(12).text("12:30", 240, 295);

// PASAJERO
doc.fontSize(9).text("PASAJERO", 420, 200);
doc.fontSize(12).text("Juan Perez", 420, 215);

// ASIENTO
doc.fontSize(9).text("ASIENTO", 420, 240);
doc.fontSize(12).text("5", 420, 255);

// QR
const qr = await QRCode.toDataURL(folio);
const qrImage = qr.replace(/^data:image\/png;base64,/, "");
doc.image(Buffer.from(qrImage, "base64"), 430, 260, { width: 90 });

// aviso
doc.moveDown(8);
doc.fontSize(9).text("Preséntate 20 minutos antes de la salida.", { align: "center" });
doc.text("Este boleto es válido solo para el horario indicado.", { align: "center" });
doc.text("No tiene devolución ni cambio.", { align: "center" });

doc.end();

stream.on("finish", () => {
console.log("PDF REAL generado:", file);
});

}

generarPDF();

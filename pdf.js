const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function generarPDF(datos) {

  const { nombre, origen, destino, fecha, hora, asiento } = datos;

  const file = "boleto_" + Date.now() + ".pdf";
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  const stream = fs.createWriteStream(file);
  doc.pipe(stream);

  doc.fontSize(20).text("Boleto Buses VientoSur", { align: "center" });

  doc.moveDown();

  doc.text("Nombre: " + nombre);
  doc.text("Ruta: " + origen + " - " + destino);
  doc.text("Fecha: " + fecha);
  doc.text("Hora: " + hora);
  doc.text("Asiento: " + asiento);

  const qr = await QRCode.toDataURL(nombre + "-" + asiento);
  const qrImage = qr.replace(/^data:image\/png;base64,/, "");

  doc.image(Buffer.from(qrImage, "base64"), 400, 200, { width: 100 });

  doc.end();

  return new Promise(resolve => {
    stream.on("finish", () => resolve(file));
  });

}

module.exports = generarPDF

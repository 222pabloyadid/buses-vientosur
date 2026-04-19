const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

function generarPDF(datos) {
  return new Promise((resolve, reject) => {
    try {
      const { nombre, origen, destino, fecha, hora, asiento } = datos;

      const folio = "BS-" + Date.now();
      const file = "boleto_" + folio + ".pdf";

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const stream = fs.createWriteStream(file);

      doc.pipe(stream);

      // ===== DATOS QR =====
      const qrData = JSON.stringify({
        nombre,
        origen,
        destino,
        fecha,
        hora,
        asiento,
        folio
      });

      // ===== GENERAR QR =====
      QRCode.toDataURL(qrData, (err, qrImage) => {
        if (err) return reject(err);

        // ===== HEADER =====
        doc.fontSize(20).text("BOLETO DE VIAJE", { align: "center" });

        doc.moveDown();
        doc.fontSize(12).text("Buses VientoSur", { align: "center" });

        doc.moveDown();
        doc.fontSize(10).text("Gracias por preferir Buses VientoSur.", { align: "center" });
        doc.text("Te deseamos un excelente viaje.", { align: "center" });

        doc.moveDown(2);

        // Línea
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

        doc.moveDown();

        // ===== FOLIO =====
        doc.fontSize(10).text("Folio: " + folio, { align: "right" });

        doc.moveDown();

        // ===== DATOS PASAJERO =====
        doc.fontSize(12).text("DATOS DEL PASAJERO", { underline: true });

        doc.moveDown(0.5);
        doc.fontSize(11).text("Nombre: " + nombre);
        doc.text("Ruta: " + origen + " - " + destino);
        doc.text("Fecha: " + fecha);
        doc.text("Hora: " + hora);
        doc.text("Asiento: " + asiento);

        // ===== QR =====
        doc.image(qrImage, 400, 200, { width: 120 });

        doc.moveDown(4);

        // ===== ASIENTO GRANDE =====
        doc.fontSize(16).text("ASIENTO N° " + asiento, { align: "center" });

        doc.moveDown();

        // Línea
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();

        doc.moveDown(2);

        // ===== MENSAJES =====
        doc.fontSize(10).text("Preséntate 20 minutos antes de la salida.", { align: "center" });
        doc.text("Este boleto es válido solo para el horario indicado.", { align: "center" });
        doc.text("No tiene devolución ni cambio.", { align: "center" });

        doc.moveDown();

        doc.text("Código de validación: " + folio, { align: "center" });

        doc.moveDown();

        doc.text("Este documento es tu comprobante oficial de viaje.", { align: "center" });

        doc.end();
      });

      stream.on("finish", () => resolve(file));
      stream.on("error", reject);

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = generarPDF;


document.addEventListener("DOMContentLoaded", () => {
  const tarjeta = document.querySelector(".opcion");
  if (!tarjeta) return;

  const mensajes = ["¡Hola! Bienvenido a Buses VientoSur.", "❤️ Gracias por viajar con nosotros.", "🚌 Tu preferencia nos hace mejores.", "💚 Gracias por confiar en nuestra empresa.", "¡Que tengas un excelente viaje!", "🌷 Viaja tranquilo, nosotros te acompañamos.", "😊 De regreso a casa, ¡buen viaje!", "¡Buen viaje a nuestros estudiantes!", "✨ Un nuevo día, un nuevo destino.", "🌈 Nos alegra tenerte a bordo.", "🚍 Tu viaje comienza con nosotros.", "🌻 Cada viaje tiene una historia.", "¡Qué alegría viajar contigo!", "⭐ Gracias por elegir VientoSur.", "🎒 Que hoy tengas un hermoso día.", "💙 Gracias por elegirnos una vez más.", "❤️ Recorriendo juntos nuestro hermoso sur.", "¡Buen viaje y que tengas un lindo día!", "💚 Estudiantes, ¡mucho éxito en sus estudios!", "☀️ Tu confianza nos impulsa a seguir.", "🌷 Que tengas un feliz regreso a casa.", "😊 Cada pasajero es importante para nosotros.", "🌄 Seguimos creciendo gracias a tu preferencia.", "✨ Sonríe, hoy puede ser un gran día.", "🌈 Viaja cómodo, viaja VientoSur.", "🚍 Tu seguridad y comodidad son nuestra prioridad.", "🌻 Un viaje tranquilo comienza con una sonrisa.", "🏡 Gracias por acompañarnos en cada recorrido.", "⭐ Cada día trabajamos para mejorar.", "🎒 Nos sentimos felices de llevarte a tu destino.", "💙 El sur es más bonito cuando viajamos juntos.", "❤️ Tu confianza es nuestro mayor compromiso.", "🚌 Que tengas un viaje lleno de buenos momentos.", "💚 A nuestros estudiantes, ¡mucho ánimo!", "☀️ No hay nada como volver a casa.", "🌷 Comienza tu día con energía y optimismo.", "😊 VientoSur, siempre pensando en nuestros pasajeros.", "🌄 Gracias por permitirnos ser parte de tu día.", "✨ Los pequeños detalles hacen grandes viajes.", "🌈 Nuestra mejor publicidad es tu confianza.", "🚍 Tu preferencia nos motiva a ser mejores cada día.", "🌻 Que nunca te falten motivos para sonreír.", "🏡 Disfruta el camino, nosotros te llevamos.", "⭐ Un nuevo viaje, una nueva oportunidad.", "🎒 Nos importa cada persona que viaja con nosotros.", "💙 Gracias por ser parte de la familia VientoSur.", "❤️ Orgullosos de recorrer nuestra hermosa región.", "🚌 Hoy es un buen día para viajar.", "💚 Tu destino también es nuestro compromiso.", "☀️ VientoSur crece gracias a personas como tú."];
  const ahora = new Date();
  const dia = ahora.getDay();
  const hora = ahora.getHours();

  if (hora < 12) {
    mensajes.push("¡Buenos días! Comienza tu viaje con alegría.");
  } else if (hora >= 19) {
    mensajes.push("¡Buenas noches! Que tengas un viaje tranquilo.");
  } else {
    mensajes.push("¡Buenas tardes! Gracias por acompañarnos.");
  }

  if (dia === 5) {
    mensajes.push("¡Feliz viernes! Último día de trabajo. ¡Buen viaje!");
    mensajes.push("¡Por fin viernes! Que tengas un excelente fin de semana.");
  }

  if (dia === 1) {
    mensajes.push("¡Feliz lunes! Comenzamos una nueva semana juntos.");
  }

  if (dia === 0 || dia === 6) {
    mensajes.push("¡Feliz fin de semana! Disfruta tu viaje.");
  }

  const saludo = document.createElement("div");
  saludo.id = "saludo-vientosur";
  saludo.style.cssText =
    "background:linear-gradient(110deg,#075b90,#00a5a7);" +
    "color:white;padding:12px;border-radius:12px;" +
    "text-align:center;font-weight:bold;font-size:14px;" +
    "margin:12px 0;";

  const seccion = tarjeta.closest("section");
  if (!seccion) return;

  seccion.parentNode.insertBefore(saludo, seccion);

  let anterior = -1;

  function cambiar() {
    let n;
    do {
      n = Math.floor(Math.random() * mensajes.length);
    } while (n === anterior && mensajes.length > 1);

    anterior = n;
    saludo.textContent = mensajes[n];
  }

  cambiar();
  setInterval(cambiar, 18000);
});

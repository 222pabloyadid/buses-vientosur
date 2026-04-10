const { MercadoPagoConfig, Preference } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const crearPago = async (nombre, precio) => {
  const preference = {
    items: [
      {
        title: "Pasaje Buses VientoSur",
        quantity: 1,
        currency_id: "CLP",
        unit_price: Number(precio),
      }
    ],
    payer: {
      name: nombre,
    },
    back_urls: {
      success: "https://buses-vientosur.onrender.com/success",
      failure: "https://buses-vientosur.onrender.com/fallo",
      pending: "https://buses-vientosur.onrender.com/pending",
    },
    auto_return: "approved",
  };

  const preferenceClient = new Preference(client);
  const response = await preferenceClient.create({ body: preference });

  return response.init_point;
};

module.exports = { crearPago };

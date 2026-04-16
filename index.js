const express = require("express");

const app = express();
app.use(express.json());

// CORS — only allow requests from limo4all.ca
app.use(function(req, res, next) {
  var allowed = ['https://limo4all.ca', 'https://www.limo4all.ca'];
  var origin  = req.headers.origin;
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.post("/calculate-fare", async (req, res) => {
  const { pickup, dropoff, vehicle } = req.body;

  const rates = {
    sedan: 2.00,
    suv:   2.20
  };

  const minFares = {
    sedan: 10,
    suv:   15
  };

  const rate    = rates[vehicle]    || rates.sedan;
  const minFare = minFares[vehicle] || minFares.sedan;

  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type":    "application/json",
          "X-Goog-Api-Key":  process.env.GOOGLE_API_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters"
        },
        body: JSON.stringify({
          origin:      { address: pickup },
          destination: { address: dropoff },
          travelMode:  "DRIVE"
        })
      }
    );

    const data = await response.json();

    if (!data.routes || !data.routes[0]) {
      return res.status(400).json({ error: "No route found", details: data });
    }

    const km   = data.routes[0].distanceMeters / 1000;
    const fare = Math.max(km * rate, minFare);

    res.json({ vehicle: vehicle || "sedan", distance_km: km, fare: fare });

  } catch (err) {
    res.status(500).json({ error: "Failed to calculate fare", message: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on port", PORT));

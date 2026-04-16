const express = require("express");

const app = express();
app.use(express.json());

app.post("/calculate-fare", async (req, res) => {
  const { pickup, dropoff, vehicle } = req.body;

  const rates = {
    sedan: 2.00,
    suv: 2.20
  };

  const minFares = {
    sedan: 10,
    suv: 15
  };

  const rate = rates[vehicle] || rates.sedan;
  const minFare = minFares[vehicle] || minFares.sedan;

  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
          "X-Goog-FieldMask": "routes.distanceMeters"
        },
        body: JSON.stringify({
          origin: { address: pickup },
          destination: { address: dropoff },
          travelMode: "DRIVE"
        })
      }
    );

    const data = await response.json();

    if (!data.routes || !data.routes[0]) {
      return res.status(400).json({
        error: "No route found",
        details: data
      });
    }

    const meters = data.routes[0].distanceMeters;

    // convert meters → km
    const km = meters / 1000;

    // base fare calculation
    let fare = km * rate;

    // apply minimum fare rule
    if (fare < minFare) {
      fare = minFare;
    }

    res.json({
      vehicle: vehicle || "sedan",
      distance_km: km,
      fare: fare
    });

  } catch (err) {
    res.status(500).json({
      error: "Failed to calculate fare",
      message: err.message
    });
  }
});

// Cloud Run uses PORT
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

app.post("/calculate-fare", async (req, res) => {
  const { pickup, dropoff } = req.body;

  try {
    const response = await fetch(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_API_KEY,
        },
        body: JSON.stringify({
          origin: { address: pickup },
          destination: { address: dropoff },
          travelMode: "DRIVE",
        }),
      }
    );

    const data = await response.json();

    const meters = data.routes[0].distanceMeters;
    const km = meters / 1000;

    const fare = 5 + km * 2;

    res.json({
      distance_km: km,
      fare: fare
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to calculate fare" });
  }
});

// IMPORTANT: Cloud Run uses PORT
app.listen(process.env.PORT || 8080);

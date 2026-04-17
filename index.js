const express = require('express');
const app = express();
app.use(express.json());

// ── CORS ───────────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === 'https://limo4all.ca' || origin === 'https://www.limo4all.ca') {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Pearson detection ──────────────────────────────────────────────────────
const PEARSON_KEYWORDS = ['pearson', 'yyz', 'lester b. pearson'];

function isPearson(address) {
  const lower = (address || '').toLowerCase();
  return PEARSON_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Pearson zone flat rate (sedan) ─────────────────────────────────────────
// Calibrated $7 below competitor at each known data point:
//   Downtown (~27km):  $70 sedan / $85 SUV   (competitor $77/$92)
//   Scarborough (~38km): $83 sedan / $98 SUV  (competitor $90/$105)
//   Markham (~48km):   $86 sedan / $101 SUV  (competitor $93/$108)
//   Hamilton (~68km):  $133 sedan / $148 SUV (competitor $140/$155)
//   Oshawa (~92km):    $133 sedan / $148 SUV (competitor $140/$155)
//   Bowmanville (~122km): $174 sedan / $189 SUV (competitor $181/$196)
// SUV = sedan + $15 flat (mirrors competitor's pricing structure)
function pearsonSedanRate(km) {
  if (km <= 12)  return 42;   // very short (near-airport neighbourhoods)
  if (km <= 20)  return 52;
  if (km <= 30)  return 70;   // Downtown Toronto zone
  if (km <= 42)  return 83;   // Scarborough / Etobicoke zone
  if (km <= 55)  return 86;   // Markham / Richmond Hill / North York zone
  if (km <= 100) return 133;  // Hamilton / Oakville / Oshawa / Aurora zone (broad flat zone)
  if (km <= 130) return 174;  // Bowmanville / Barrie / Guelph zone
  return Math.round(km * 1.50); // beyond zone — per-km
}

// ── Standard rates (non-Pearson) ──────────────────────────────────────────
const STANDARD_RATE = {
  sedan: { perKm: 1.40, min: 45 },
  suv:   { perKm: 1.65, min: 55 },
};

// ── Main route ─────────────────────────────────────────────────────────────
app.post('/calculate-fare', async (req, res) => {
  const { pickup, dropoff, vehicle = 'sedan', pickupPlaceId, dropoffPlaceId } = req.body;

  if (!pickup || !dropoff) {
    return res.status(400).json({ error: 'pickup and dropoff are required' });
  }

  const veh         = vehicle === 'suv' ? 'suv' : 'sedan';
  const pearsonTrip = isPearson(pickup) || isPearson(dropoff);

  const origin      = pickupPlaceId  ? { placeId: pickupPlaceId  } : { address: pickup  };
  const destination = dropoffPlaceId ? { placeId: dropoffPlaceId } : { address: dropoff };

  try {
    const routesRes = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type':     'application/json',
          'X-Goog-Api-Key':   process.env.GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin,
          destination,
          travelMode:        'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
        }),
      }
    );

    const routesData = await routesRes.json();

    if (!routesData.routes || routesData.routes.length === 0) {
      return res.status(400).json({ error: "We couldn't find a route between those locations." });
    }

    const meters = routesData.routes[0].distanceMeters;
    const km     = meters / 1000;
    let   fare;

    if (pearsonTrip) {
      // Zone flat rate — SUV is sedan + $15 flat (same structure as competitor)
      const sedanRate = pearsonSedanRate(km);
      fare = veh === 'suv' ? sedanRate + 15 : sedanRate;
    } else {
      // Non-airport: pure per-km, minimum applies only on very short trips
      const { perKm, min } = STANDARD_RATE[veh];
      fare = Math.max(km * perKm, min);
      fare = Math.round(fare * 100) / 100;
    }

    return res.json({
      fare,
      distance_km: Math.round(km * 10) / 10,
      vehicle:     veh,
      pearsonTrip,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Route lookup failed. Please try again.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`fare-api listening on ${PORT}`));

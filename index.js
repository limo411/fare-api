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

// ── Pearson zone flat rate (sedan) — calibrated to official Pearson tariff ─
// Verified against: Georgetown ~40km=$93, Aurora ~53km=$115, Newmarket ~58km=$124,
// Hamilton DT ~65km=$140, Guelph ~87km=$164, Kitchener ~105km=$194
// Trips outside zone: $2.01/km (per official Pearson tariff)
function pearsonSedanRate(km) {
  if (km <= 10)  return 48;
  if (km <= 15)  return 58;
  if (km <= 20)  return 65;
  if (km <= 25)  return 72;
  if (km <= 30)  return 78;
  if (km <= 35)  return 85;
  if (km <= 40)  return 93;
  if (km <= 45)  return 100;
  if (km <= 50)  return 107;
  if (km <= 55)  return 115;
  if (km <= 60)  return 124;
  if (km <= 70)  return 140;
  if (km <= 80)  return 153;
  if (km <= 90)  return 164;
  if (km <= 100) return 178;
  if (km <= 110) return 194;
  if (km <= 120) return 212;
  return Math.round(km * 2.01);
}

// ── Standard rates (non-Pearson): $2.05/km with minimum base fare ──────────
const STANDARD_RATE = {
  sedan: { perKm: 2.05, min: 45 },
  suv:   { perKm: 2.36, min: 55 },  // SUV ~15% premium over sedan
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
      // Zone-based flat rate from Pearson tariff (sedan), +20% for SUV
      const sedanRate = pearsonSedanRate(km);
      fare = veh === 'suv' ? Math.round(sedanRate * 1.20) : sedanRate;
    } else {
      // $2.05/km (sedan) or $2.36/km (SUV), with minimum base fare
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

# Data

- `airports.json`: airports with scheduled service and an IATA code, as
  `[iata, city, isoCountry, lat, lon, size (L/M/S), name]`. It is derived from
  [OurAirports](https://ourairports.com/data/) (public domain), downloaded in Oct 2026.
- `airport-coords.json`: `{ iata: [lat, lon] }`, a light copy loaded by the maps in the browser.

To refresh both files, download `airports.csv` from https://davidmegginson.github.io/ourairports-data/
and rerun the filter. The filter keeps rows with `scheduled_service = yes`, a 3-letter IATA code,
and a type of large, medium or small airport.

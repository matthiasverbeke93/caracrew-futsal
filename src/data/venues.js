/**
 * Street addresses for the halls we play in, so a fixture's venue can link to Google Maps.
 *
 * Keys are the exact `games.location` strings the calendar import produces
 * (`normalizeLocation` in `utils/lzvCalendar.js` = "<hall> <city>"), which is also how LZV
 * Cup names them. Lookup is case/whitespace tolerant — see `utils/venue.js`.
 *
 * Source: https://www.lzvcup.be/sportshalls/11 (our region's hall list, incl. its own
 * "Route" links, which point at the same street/city pairs). **De Nekker is not on that
 * page** — it is a provincial sports centre, address from denekker.be. Everything else is
 * transcribed from LZV; if they add a hall, the link still works from the venue name alone
 * (Google just gets a fuzzier query), so this table is an accuracy upgrade, not a gate.
 */
export const VENUE_ADDRESSES = {
  "De Nekker Mechelen": { street: "Nekkerspoel-Borcht 19", city: "Mechelen" },
  "Sporthal Boortmeerbeek": { street: "Sportveldweg 6", city: "Boortmeerbeek" },
  "Winketkaai Mechelen": { street: "Winketkaai 39", city: "Mechelen" },
  "Paardenstraatje Mechelen": { street: "Paardenstraatje 8", city: "Mechelen" },
  "IHAM Mechelen": { street: "Bautersemstraat 57", city: "Mechelen" },
  "Arena Walem": { street: "Pastorijstraat 50", city: "Walem" },
  "De Plaon Mechelen": { street: "Eksterstraat 100", city: "Mechelen" },
  "Kouter Leest": { street: "Dorpstraat 67", city: "Leest" },
  "Appelaar Muizen": { street: "Jan Frans van Geelstraat", city: "Muizen" },
  "Ter Heide Hofstade": { street: "Zandstraat 3", city: "Hofstade" },
  "Sporthal Zemst": { street: "Schoolstraat 13", city: "Zemst" },
  "Berentrode Bonheiden": { street: "Grote Doelstraat 1b", city: "Bonheiden" },
  "Heiveld St-Katelijne-Waver": { street: "Dreefvelden 1", city: "St-Katelijne-Waver" },
  "SportCube Eppegem": { street: "Waterleestweg 14", city: "Eppegem" },
  "PTS Mechelen": { street: "Antwerpsesteenweg 145", city: "Mechelen" },
  "BimSem Mechelen": { street: "Bleekstraat 3", city: "Mechelen" },
  "Sint-Romboutscollege Mechelen": { street: "Veemarkt 56", city: "Mechelen" },
  "Bruultjeshoek Onze Lieve Vrouw Waver": {
    street: "Wavervelden 14",
    city: "Onze Lieve Vrouw Waver",
  },
  "De Pollepel Duffel": { street: "Naalstraat 43b", city: "Duffel" },
  "Klein Boom Putte": { street: "Mechelbaan 604", city: "Putte" },
  "BA Zandpoort Mechelen": { street: "Zandpoortvest 9A", city: "Mechelen" },
};

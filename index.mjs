#!/usr/bin/env node
// Airbnb Scraper: stays in any city or region as structured JSON (price, rating, reviews, beds, coordinates, photos).
// Each results page is requested from this machine through the public Unbrowse Airbnb search tool and parsed here.
import { fileURLToPath } from "node:url";
import { RefusedError, cli, readPage } from "./lib/read-page.mjs";
import { MAX_PAGES, PAGE_SIZE, cursorFor, domainSwitch, isoDay, parseSearch } from "./parse.mjs";

// Airbnb moves visitors from some countries to a local domain; each domain has its own public tool.
const TOOLS = {
  "www.airbnb.com": "public.airbnb_com.get_s_homes",
  "www.airbnb.com.sg": "public.airbnb_com_sg.get_s_homes",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let domain = "www.airbnb.com"; // sticky: once Airbnb sends this network to a local domain, stay there

/** One results page (0-based). Returns { listings, cursors }. */
async function page(location, n, input, ctx, log) {
  for (let hop = 0; hop < 2; hop++) {
    try {
      const p = await readPage(TOOLS[domain], { location, ...input, cursor: cursorFor(n) }, { hosts: ["airbnb.com", "airbnb.com.sg"] });
      const r = parseSearch(p.body, ctx);
      if (!r) throw new Error(`Airbnb did not return search results for "${location}"`);
      return r;
    } catch (err) {
      const moved = err instanceof RefusedError ? domainSwitch(err.page?.body) : null;
      if (!moved) throw err;
      if (!TOOLS[moved]) throw new Error(`Airbnb sends this network to ${moved}, which has no public tool yet. Run from another country or add one (see CONTRIBUTING.md).`);
      log(`Airbnb redirects this network to ${moved}; using that domain (prices stay in USD)`);
      domain = moved;
    }
  }
  throw new Error("Airbnb kept switching domains");
}

/**
 * Stays for a location ("Lisbon", "Austin, TX", "Shibuya, Tokyo").
 * Options: max (default 50, 18 per page, up to 270), checkIn/checkOut (YYYY-MM-DD; without them Airbnb picks
 * flexible dates), adults, and filters applied to the results: maxPrice / minPrice (per night), minBedrooms,
 * minRating, superhostOnly, guestFavoriteOnly.
 */
export async function scrape(location, { max = 50, checkIn, checkOut, adults, maxPrice, minPrice, minBedrooms, minRating, superhostOnly, guestFavoriteOnly, log = () => {} } = {}) {
  const where = String(location ?? "").trim();
  if (!where) throw new Error("Give a location, e.g. Lisbon or \"Austin, TX\"");
  const ci = isoDay(checkIn, "check-in");
  const co = isoDay(checkOut, "check-out");
  if (!!ci !== !!co) throw new Error("Give both check-in and check-out, or neither");
  if (ci && !(new Date(co) > new Date(ci))) throw new Error("Check-out must be after check-in");
  const input = { checkin: ci, checkout: co, adults: adults ? String(adults) : "" };
  const ctx = { checkIn: ci || undefined, checkOut: co || undefined };
  const limit = Math.max(1, Math.min(Number(max) || 50, PAGE_SIZE * MAX_PAGES));
  const n = (x) => (x === undefined || x === null || x === "" ? null : Number(x));
  const keep = (l) => {
    const night = l.price.perNight ?? l.price.total;
    return (
      (n(maxPrice) == null || (night != null && night <= n(maxPrice))) &&
      (n(minPrice) == null || (night ?? -1) >= n(minPrice)) &&
      (n(minBedrooms) == null || (l.bedrooms ?? -1) >= n(minBedrooms)) &&
      (n(minRating) == null || (l.rating ?? -1) >= n(minRating)) &&
      (!superhostOnly || l.isSuperhost) &&
      (!guestFavoriteOnly || l.isGuestFavorite)
    );
  };
  const seen = new Set();
  const out = [];
  const now = new Date().toISOString();
  for (let p = 0; p < MAX_PAGES && out.length < limit; p++) {
    if (p) await sleep(1000 + Math.random() * 1000);
    const r = await page(where, p, input, ctx, log);
    let fresh = 0;
    for (const l of r.listings) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      fresh++;
      if (keep(l) && out.length < limit) out.push({ ...l, checkIn: ci || null, checkOut: co || null, searchQuery: where, scrapedAt: now });
    }
    log(`${where}: page ${p + 1}: ${r.listings.length} listings, ${out.length} kept`);
    if (!fresh || r.listings.length < PAGE_SIZE || p + 1 >= (r.cursors.length || MAX_PAGES)) break;
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli(
    async (pos, f) => {
      const out = [];
      for (const q of pos) {
        out.push(
          ...(await scrape(q, {
            max: f.max, checkIn: f.checkin, checkOut: f.checkout, adults: f.adults, maxPrice: f["max-price"], minPrice: f["min-price"],
            minBedrooms: f["min-bedrooms"], minRating: f["min-rating"], superhostOnly: !!f.superhost, guestFavoriteOnly: !!f["guest-favorite"],
            log: (m) => process.stderr.write(`${m}\n`),
          })),
        );
      }
      return out;
    },
    `
Usage: node index.mjs <location>... [options]

  "Lisbon"   "Austin, TX"   "Shibuya, Tokyo"
  --max N                  stays per location (default 50, 18 per page, up to 270)
  --checkin YYYY-MM-DD --checkout YYYY-MM-DD   (without dates Airbnb picks flexible dates)
  --adults N
  --max-price N --min-price N    per night, USD
  --min-bedrooms N --min-rating 4.8 --superhost --guest-favorite

Needs UNBROWSE_API_KEY (free at https://unbrowse.ai).`,
  );
}

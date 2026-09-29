import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { cursorFor, domainSwitch, isoDay, money, parseSearch } from "./parse.mjs";

// Fixture: a real www.airbnb.com results page (Lisbon, 2 nights, USD), 2026-09-28, trimmed to the embedded results JSON.
const html = fs.readFileSync(new URL("./fixtures/search-lisbon.html", import.meta.url), "utf8");

test("airbnb: 18 listings with core fields and 15 page cursors", () => {
  const r = parseSearch(html, { checkIn: "2026-11-10", checkOut: "2026-11-12" });
  assert.equal(r.listings.length, 18);
  assert.equal(r.cursors.length, 15);
  for (const l of r.listings) {
    assert.match(l.id, /^\d+$/);
    assert.ok(l.name && l.url.includes(l.id) && l.latitude && l.longitude && l.thumbnail, l.id);
    assert.ok(l.price.total > 0 && l.price.currency === "USD" && l.price.nights === 2, JSON.stringify(l.price));
  }
  const first = r.listings[0];
  assert.deepEqual([first.id, first.roomType, first.neighborhood, first.rating, first.reviewsCount, first.isGuestFavorite], ["15629885", "Serviced apartment", "Campo de Ourique", 4.94, 319, true]);
  assert.deepEqual(first.price, { total: 198, perNight: 98.99, originalTotal: null, currency: "USD", nights: 2, label: "$198 USD for 2 nights" });
  assert.equal(first.url, "https://www.airbnb.com/rooms/15629885?check_in=2026-11-10&check_out=2026-11-12");
  assert.equal(first.bedrooms, 1);
  assert.equal(first.beds, 1);
});

test("airbnb: page cursors are offsets the scraper can build itself", () => {
  const r = parseSearch(html);
  assert.deepEqual(r.cursors.slice(0, 3), [cursorFor(0), cursorFor(1), cursorFor(2)]);
});

test("airbnb: domain switch and non-results pages", () => {
  const sw = '<html><head><title>Redirecting to www.airbnb.com.sg</title></head><body><form method="POST" action="https://www.airbnb.com.sg/v2/domain_switch/handoff"></form></body></html>';
  assert.equal(parseSearch(sw), null);
  assert.equal(domainSwitch(sw), "www.airbnb.com.sg");
  assert.equal(domainSwitch(html), null);
});

test("airbnb: dates and money", () => {
  assert.equal(isoDay("2026-11-10", "x"), "2026-11-10");
  assert.equal(isoDay(undefined, "x"), "");
  assert.throws(() => isoDay("10/11/2026", "check-in"), /YYYY-MM-DD/);
  assert.deepEqual(money("$1,234.50 USD"), { amount: 1234.5, currency: "USD" });
  assert.deepEqual(money("€98"), { amount: 98, currency: "EUR" });
});

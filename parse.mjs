// Airbnb search results from the page's own embedded data (no browser). Pure: HTML in, plain objects out.

export function walk(o, key, out = []) {
  if (o && typeof o === "object") {
    if (key in o) out.push(o[key]);
    for (const v of Object.values(o)) walk(v, key, out);
  }
  return out;
}

/** The page's deferred state JSON, or null when this is not a results page (bot check, domain switch). */
export function pageState(html) {
  const m = html.match(/<script id="data-deferred-state-0"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/** "$1,234.50 USD" / "€98" / "S$120" → { amount, currency } */
export function money(s) {
  if (!s) return { amount: null, currency: null };
  const t = String(s).trim();
  const amount = Number((t.match(/\d[\d,]*(?:\.\d+)?/)?.[0] ?? "").replace(/,/g, ""));
  const code = t.match(/\b([A-Z]{3})\b/)?.[1] ?? (/€/.test(t) ? "EUR" : /£/.test(t) ? "GBP" : /^S\$/.test(t) ? "SGD" : /^\$/.test(t) ? "USD" : null);
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : null, currency: code };
}

const bodies = (lines) => (lines ?? []).map((x) => x?.body).filter(Boolean);

function listingId(r) {
  const raw = r.demandStayListing?.id ?? r.listing?.id;
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return raw;
  const decoded = Buffer.from(raw, "base64").toString();
  return decoded.match(/:(\d+)$/)?.[1] ?? null;
}

/** "Flat in Graça" → { roomType: "Flat", neighborhood: "Graça" } */
function typeAndPlace(title) {
  const m = String(title ?? "").match(/^(.+?) in (.+)$/);
  return m ? { roomType: m[1], neighborhood: m[2] } : { roomType: title ?? null, neighborhood: null };
}

/** One search result → a flat listing record. */
export function parseResult(r, { checkIn, checkOut } = {}) {
  const id = listingId(r);
  if (!id) return null;
  const line = r.structuredDisplayPrice?.primaryLine ?? {};
  const shown = money(line.discountedPrice ?? line.price);
  const original = money(line.originalPrice);
  const item0 = r.structuredDisplayPrice?.explanationData?.priceDetails?.[0]?.items?.[0] ?? {};
  const detail = item0.description ?? "";
  // Hotels carry no primary price line; the breakdown's first line holds the stay total.
  if (shown.amount == null) Object.assign(shown, money(item0.priceString ?? walk(r.structuredDisplayPrice, "price").find((x) => typeof x === "string")));
  const nightsMatch = detail.match(/(\d+)\s+nights?\s*x\s*(.+)$/i) ?? String(line.qualifier ?? "").match(/for (\d+) nights?/i);
  const nights = nightsMatch ? Number(nightsMatch[1]) : null;
  const perNight = nightsMatch?.[2] ? money(nightsMatch[2]).amount : shown.amount && nights ? Math.round((shown.amount / nights) * 100) / 100 : null;
  const ratingText = r.avgRatingA11yLabel ?? r.avgRatingLocalized ?? "";
  const rating = Number(ratingText.match(/(\d(?:\.\d+)?)\s*(?:out of|\()/)?.[1] ?? NaN);
  const reviews = Number((ratingText.match(/([\d,]+)\s*reviews?/)?.[1] ?? r.avgRatingLocalized?.match(/\(([\d,]+)\)/)?.[1] ?? "").replace(/,/g, ""));
  const lines = [...bodies(r.structuredContent?.primaryLine), ...bodies(r.structuredContent?.secondaryLine)];
  const num = (re) => { const x = lines.join(" · ").match(re); return x ? Number(x[1]) : null; };
  const badges = (r.badges ?? []).map((b) => b?.text).filter(Boolean);
  const coord = r.demandStayListing?.location?.coordinate ?? {};
  const photos = (r.contextualPictures ?? []).map((p) => p?.picture).filter(Boolean);
  const { roomType, neighborhood } = typeAndPlace(r.title);
  return {
    id,
    url: `https://www.airbnb.com/rooms/${id}${checkIn && checkOut ? `?check_in=${checkIn}&check_out=${checkOut}` : ""}`,
    name: r.subtitle ?? r.nameLocalized?.localizedStringWithTranslationPreference ?? null,
    title: r.title ?? null,
    roomType,
    neighborhood,
    rating: Number.isFinite(rating) ? rating : null,
    reviewsCount: Number.isFinite(reviews) && reviews > 0 ? reviews : ratingText ? 0 : null,
    isNew: /^New\b/i.test(r.avgRatingLocalized ?? ""),
    isGuestFavorite: badges.some((b) => /guest favou?rite/i.test(b)),
    isSuperhost: badges.some((b) => /superhost/i.test(b)),
    badges,
    price: {
      total: shown.amount,
      perNight,
      originalTotal: original.amount && shown.amount && original.amount > shown.amount ? original.amount : null,
      currency: shown.currency,
      nights,
      label: [line.discountedPrice ?? line.price, line.qualifier].filter(Boolean).join(" ").replace(/\s+/g, " ") || null,
    },
    bedrooms: num(/(\d+)\s+bedrooms?/i) ?? (lines.some((l) => /studio/i.test(l)) ? 0 : null),
    beds: num(/(\d+)\s+(?:\w+\s+)?beds?\b/i),
    bedInfo: lines,
    latitude: coord.latitude ?? null,
    longitude: coord.longitude ?? null,
    thumbnail: photos[0] ?? null,
    photos,
    paymentNotes: (r.paymentMessages ?? []).map((p) => p?.text).filter(Boolean),
  };
}

/** A results page → { listings, cursors } (cursors: every page's cursor, in order, as listed on this page). */
export function parseSearch(html, ctx = {}) {
  const state = pageState(html);
  if (!state) return null;
  const results = walk(state, "searchResults").find((x) => Array.isArray(x)) ?? [];
  const listings = results.map((r) => parseResult(r, ctx)).filter(Boolean);
  const cursors = walk(state, "pageCursors").find((x) => Array.isArray(x)) ?? [];
  return { listings, cursors };
}

/** Results come 18 to a page; a page's cursor is just its offset, base64-encoded (the site lists the same ones). */
export const PAGE_SIZE = 18;
export const MAX_PAGES = 15;
export const cursorFor = (page) => Buffer.from(JSON.stringify({ section_offset: 0, items_offset: page * PAGE_SIZE, version: 1 })).toString("base64");

/**
 * Airbnb answers visitors from some countries with a tiny page that posts them on to their local domain
 * ("Redirecting to www.airbnb.com.sg"). Returns that domain, or null.
 */
export function domainSwitch(html) {
  const m = String(html ?? "").match(/action="https:\/\/(www\.airbnb\.[a-z.]+)\/v2\/domain_switch/);
  return m ? m[1] : null;
}

/** "2026-11-10" or "" (flexible dates). Throws on anything else. */
export function isoDay(v, name) {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) throw new Error(`${name} must be YYYY-MM-DD, got "${v}"`);
  return s;
}

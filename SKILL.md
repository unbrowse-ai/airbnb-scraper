---
name: airbnb-scraper
description: Get Airbnb stays for any city or area as JSON with total and nightly price (USD), rating, reviews, Guest Favourite and Superhost flags, bedrooms, beds, coordinates and photos, for given dates and guests. Use when the user asks about Airbnb prices, availability or listings in a place.
---

# Airbnb scraper

## When to use
- "Airbnb prices in Lisbon for 10-14 November for 2 people", "the best-rated 2-bedroom Airbnbs in Austin under $200 a night", "compare Airbnb prices in Kyoto and Osaka".
- Search results only (no reviews text, calendars or host details). Up to 270 stays per location.

## Run
Needs `UNBROWSE_API_KEY` (free at https://unbrowse.ai). From the repo root:

```bash
node index.mjs Lisbon --checkin 2026-11-10 --checkout 2026-11-14 --adults 2 --max 100 > out.json
node index.mjs "Austin, TX" --max-price 200 --min-bedrooms 2 --guest-favorite > out.json
```

Options: `--max N` (18 per page, up to 270), `--checkin` / `--checkout` (YYYY-MM-DD, both or neither), `--adults N`, `--max-price` / `--min-price` (per night, USD), `--min-bedrooms`, `--min-rating`, `--superhost`, `--guest-favorite`.
Progress goes to stderr, the JSON array to stdout. Exit 1 on error, 2 on zero results.

## Output
Array of stays: `id, url, name, title, roomType, neighborhood, rating, reviewsCount, isNew, isGuestFavorite, isSuperhost, badges[], price{total, perNight, originalTotal, currency, nights, label}, bedrooms, beds, bedInfo[], latitude, longitude, thumbnail, photos[], paymentNotes[], checkIn, checkOut, searchQuery, scrapedAt`.

## Notes
- Without dates Airbnb picks flexible dates; say so when reporting prices.
- Filters are applied after the request; `--max` counts kept stays.
- "no public tool yet" for a country domain: Airbnb redirected this network; run from elsewhere.

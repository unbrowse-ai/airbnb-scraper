# Airbnb Scraper (Node.js): stays, prices and ratings for any location as JSON

Scrape Airbnb search results for any city, region or neighbourhood into structured JSON: listing id and URL, name, room type, neighbourhood, total and per-night price in USD (with the crossed-out original price when there is a discount), number of nights, rating, review count, Guest Favourite and Superhost flags, bedrooms, beds, bed and bathroom lines, latitude and longitude, every photo, and payment notes ("Free cancellation", "Book early to save"). Give it dates and a guest count for real prices, or leave the dates out and Airbnb picks flexible ones. Up to 270 stays per search, 18 per page.

Each results page is requested through a public [Unbrowse](https://unbrowse.ai) tool that knows Airbnb's search address. The request is sent from your machine, and the page's embedded results data (the same JSON the website renders from) is parsed locally. No browser, no page layout to break. Without an Unbrowse key, or when that tool is unavailable, the scraper sends the same request straight to the site and parses it the same way.

## Quick start

```bash
git clone https://github.com/unbrowse-ai/airbnb-scraper && cd airbnb-scraper && npm install
export UNBROWSE_API_KEY=ub_live_...        # optional; free key: https://unbrowse.ai

node index.mjs Lisbon --checkin 2026-11-10 --checkout 2026-11-14 --adults 2 --max 100 > lisbon.json
node index.mjs "Austin, TX" --max-price 200 --min-bedrooms 2 --guest-favorite > austin.json
node index.mjs "Shibuya, Tokyo" "Kyoto" --max 40 > japan.json
```

| Option | Default | Meaning |
|---|---|---|
| `<location>...` | | Anything you would type into Airbnb's search box |
| `--max N` | 50 | Stays per location (18 per page, up to 270) |
| `--checkin`, `--checkout` | flexible | `YYYY-MM-DD`; give both or neither |
| `--adults N` | | Guests |
| `--max-price`, `--min-price` | | Per night, USD, applied to the results |
| `--min-bedrooms`, `--min-rating` | | Applied to the results |
| `--superhost`, `--guest-favorite` | | Keep only those stays |

From code:

```js
import { scrape } from "./index.mjs";
const stays = await scrape("Lisbon", { checkIn: "2026-11-10", checkOut: "2026-11-14", adults: 2, max: 60, maxPrice: 150 });
```

## Output

```json
{
  "id": "670694153658292838",
  "url": "https://www.airbnb.com/rooms/670694153658292838?check_in=2026-11-10&check_out=2026-11-14",
  "name": "Lisbon Downtown Baixa, ideal for short stay",
  "title": "Apartment in Santa Maria Maior",
  "roomType": "Apartment",
  "neighborhood": "Santa Maria Maior",
  "rating": 4.91,
  "reviewsCount": 227,
  "isGuestFavorite": true,
  "isSuperhost": false,
  "price": { "total": 585, "perNight": 177.29, "originalTotal": 710, "currency": "USD", "nights": 4, "label": "$585 USD for 4 nights" },
  "bedrooms": 1, "beds": 1,
  "bedInfo": ["1 bedroom", "1 king bed", "1 bathroom"],
  "latitude": 38.7111, "longitude": -9.1357,
  "thumbnail": "https://a0.muscache.com/im/pictures/miso/Hosting-670694153658292838/original/9850617f-1452-45ac-99e6-8637d251db1b.jpeg",
  "paymentNotes": ["Book early to save"],
  "checkIn": "2026-11-10", "checkOut": "2026-11-14",
  "searchQuery": "Lisbon"
}
```

## Fields

| Field | Notes |
|---|---|
| `id`, `url` | Listing id; the room URL carries your dates |
| `name`, `title`, `roomType`, `neighborhood` | "Apartment in Santa Maria Maior" is split into type and place |
| `rating`, `reviewsCount`, `isNew` | `isNew` for listings without enough reviews yet |
| `isGuestFavorite`, `isSuperhost`, `badges[]` | |
| `price.total`, `price.perNight`, `price.originalTotal`, `price.currency`, `price.nights`, `price.label` | Total for the stay in USD; `originalTotal` only when discounted |
| `bedrooms`, `beds`, `bedInfo[]` | Studios have `bedrooms: 0` |
| `latitude`, `longitude` | Airbnb's approximate map position |
| `thumbnail`, `photos[]` | Full-size photo URLs |
| `paymentNotes[]` | Cancellation and payment messages |
| `checkIn`, `checkOut`, `searchQuery`, `scrapedAt` | Context |

## FAQ

**Why do I see "Airbnb redirects this network to www.airbnb.com.sg"?** Airbnb sends visitors from some countries to their local domain. The scraper follows to that domain when it has a public tool for it (airbnb.com and airbnb.com.sg today); prices stay in USD and room URLs stay on airbnb.com. From a country whose domain has no tool yet, it stops with a clear message.

**More than 270 stays?** Airbnb shows 15 pages per search. Split the area (neighbourhoods) or vary the dates and filters.

**Price filters at Airbnb's side?** Filters are applied to the results the search returns, so `--max 50 --max-price 100` reads pages until it has 50 matching stays or runs out.

**Do I need a key?** No. With a free [Unbrowse](https://unbrowse.ai) key, the scraper runs Unbrowse's public Airbnb tool first, which tells your machine which request to send. Without a key, or when a tool is unavailable, it sends the same request directly with a normal browser user agent (one `note:` line on stderr says so). Either way the request leaves from your IP, and your key is never sent to the site.

---

Part of [open-scrapers](https://github.com/unbrowse-ai/open-scrapers): more scrapers and a catalog of 2,400+ websites callable as APIs or MCP servers.

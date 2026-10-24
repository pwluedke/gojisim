# @gojisim/scraper

Scrapes card text data from [godzillatcgdb.com](https://www.godzillatcgdb.com) into `packages/cards/data/cards.json` and `summary.json`. Images are recorded as URLs, not downloaded.

```sh
pnpm scrape
```

- **Discovery:** replays the site's card-search request (`POST /search` with empty filters), which returns every base card as JSON. Each base card page (`/card/<id>`) embeds an `allPrints` JSON array with the base print and all its variants (parallels, promo reprints).
- **Politeness:** at most one request per 1.1 s, User-Agent `GojiSim-scraper (personal project; contact pwluedke)`. Raw responses are cached in `.cache/` (gitignored); delete it to re-fetch.
- **Parsing:** card fields come from `allPrints`. The page's details table supplies the movie title and is checked for labels we don't map, which go to `unknownFields` along with traits, "Released In", and the unlabeled like count.

## Print linking

`parentId` is the site's `parent_id`. `deckCardNumber` is the card number of the root of the parent chain, with `+`, `++`, ` (Foil)` and ` (Alt)` removed; it is what the 4-copy deck limit counts against (rule 6.1.1.4). Manual corrections live in `packages/cards/data/overrides.json`, keyed by id, with a `reason`; they are applied after scraping.

## Hand-entered cards

Cards the site doesn't list yet are entered by hand in `packages/cards/data/manual-cards.json`: the full card, plus its source (the official card image, its Decklog image path, who transcribed it and when, and a source file in `data/sources/`). Their ids start at 900001, out of the site's range. Each scrape adds them to `cards.json` (listed under `manualCards` in `summary.json`) until the site lists the same card number; then the site's print wins, the scrape warns "Now on the site, remove from manual-cards.json", and the entry can go. First entry: EPR-020 Godzilla (2003), transcribed by Paul on Oct 24, 2026.

## Images

`pnpm images` downloads every `imageUrl` in `cards.json` to `.cache/images/<set>/<id>.png` (1 request per second, existing files skipped) and converts them with sharp to `apps/web/public/cards/<id>-full.webp` and `<id>-thumb.webp` (300 px wide). It writes byte sizes to `packages/cards/data/images.json`.

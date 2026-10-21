# @gojisim/scraper

Scrapes card text data from [godzillatcgdb.com](https://www.godzillatcgdb.com) into `packages/cards/data/cards.json` and `summary.json`. Images are recorded as URLs, not downloaded.

```sh
pnpm scrape
```

- **Discovery:** replays the site's card-search request (`POST /search` with empty filters), which returns every base card as JSON. Each base card page (`/card/<id>`) embeds an `allPrints` JSON array with the base print and all its variants (parallels, promo reprints).
- **Politeness:** at most one request per 1.1 s, User-Agent `GojiSim-scraper (personal project; contact pwluedke)`. Raw responses are cached in `.cache/` (gitignored); delete it to re-fetch.
- **Parsing:** card fields come from `allPrints`. The page's details table supplies the movie title and is checked for labels we don't map, which go to `unknownFields` along with traits, "Released In", and the unlabeled like count.

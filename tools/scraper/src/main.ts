import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  applyTextOverrides,
  type Card,
  CardListSchema,
  CardOverridesSchema,
  TextOverridesSchema,
  TraitSpellingsSchema,
} from "@gojisim/cards";
import { discoverBaseCards, SITE_ORIGIN } from "./discover";
import { PoliteFetcher } from "./fetcher";
import { applyTraitSpellings, linkPrints } from "./link";
import { type ParsedCardPage, parseCardPage } from "./parse";
import { collectMovieTitles, displayCardNumber, toCard } from "./normalize";

const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const dataDir = new URL("../../../packages/cards/data/", import.meta.url);

interface Failure {
  page: string;
  error: string;
}

async function main(): Promise<void> {
  const fetcher = new PoliteFetcher({ cacheDir, log: (m) => console.log(m) });
  const failures: Failure[] = [];

  const baseCards = await discoverBaseCards(fetcher);
  console.log(
    `Discovered ${baseCards.length} base cards via the /search request.`,
  );

  const pages: ParsedCardPage[] = [];
  for (const base of baseCards) {
    const url = `${SITE_ORIGIN}/card/${base.id}`;
    try {
      const html = await fetcher.get(url, `card-${base.id}.html`);
      const page = parseCardPage(html);
      if (page.activeId !== base.id) {
        throw new Error(
          `Page describes print ${page.activeId}, expected ${base.id}`,
        );
      }
      const active = page.prints.find((p) => p.id === page.activeId);
      const tableNumber = page.table["Card Number"];
      if (active && tableNumber && tableNumber !== displayCardNumber(active)) {
        throw new Error(
          `Table card number ${tableNumber} != ${displayCardNumber(active)}`,
        );
      }
      pages.push(page);
    } catch (err) {
      failures.push({ page: url, error: String(err) });
    }
  }

  const movieTitles = collectMovieTitles(pages);
  // A variant whose movie appears on no base page: its own page shows the title.
  for (const page of pages) {
    for (const print of page.prints) {
      if (
        !print.property ||
        print.property === "blank" ||
        movieTitles.has(print.property)
      )
        continue;
      const url = `${SITE_ORIGIN}/card/${print.id}`;
      try {
        const variantPage = parseCardPage(
          await fetcher.get(url, `card-${print.id}.html`),
        );
        const title =
          variantPage.activeId === print.id
            ? variantPage.table["Movie Title"]
            : undefined;
        if (title) movieTitles.set(print.property, title);
      } catch (err) {
        failures.push({ page: url, error: String(err) });
      }
    }
  }

  const byId = new Map<number, Card>();
  for (const page of pages) {
    for (const print of page.prints) {
      if (byId.has(print.id)) continue;
      try {
        byId.set(print.id, toCard(print, page, movieTitles));
      } catch (err) {
        failures.push({
          page: `${SITE_ORIGIN}/card/${page.activeId} (print ${print.id})`,
          error: String(err),
        });
      }
    }
  }

  const overrides = CardOverridesSchema.parse(
    JSON.parse(await readFile(new URL("overrides.json", dataDir), "utf8")),
  );
  const traitSpellings = TraitSpellingsSchema.parse(
    JSON.parse(
      await readFile(new URL("trait-spellings.json", dataDir), "utf8"),
    ),
  );
  const textOverrides = TextOverridesSchema.parse(
    JSON.parse(await readFile(new URL("text-overrides.json", dataDir), "utf8")),
  );
  const cards = CardListSchema.parse(
    applyTextOverrides(
      applyTraitSpellings(
        linkPrints([...byId.values()], overrides),
        traitSpellings,
      ),
      textOverrides,
    ).sort((a, b) =>
      a.cardNumber < b.cardNumber
        ? -1
        : a.cardNumber > b.cardNumber
          ? 1
          : a.id - b.id,
    ),
  );

  const perSet: Record<string, number> = {};
  for (const card of cards) perSet[card.set] = (perSet[card.set] ?? 0) + 1;
  const sortedPerSet = Object.fromEntries(
    Object.entries(perSet).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  const unknownFieldLabels = [
    ...new Set(cards.flatMap((c) => Object.keys(c.unknownFields))),
  ].sort();

  await mkdir(dataDir, { recursive: true });
  await writeFile(
    new URL("cards.json", dataDir),
    `${JSON.stringify(cards, null, 2)}\n`,
  );
  await writeFile(
    new URL("summary.json", dataDir),
    `${JSON.stringify(
      {
        source: SITE_ORIGIN,
        discovery:
          "POST /search with empty filters (base cards), then allPrints on each card page (variants)",
        total: cards.length,
        baseCards: cards.filter((c) => !c.isParallel).length,
        parallels: cards.filter((c) => c.isParallel).length,
        perSet: sortedPerSet,
        unknownFieldLabels,
        failures,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\nNetwork requests this run: ${fetcher.networkRequests}`);
  console.log(`Total cards: ${cards.length}`);
  console.table(sortedPerSet);
  console.log("unknownFields labels:", unknownFieldLabels);
  if (failures.length > 0) {
    console.error(`${failures.length} failures:`, failures);
    process.exitCode = 1;
  }
}

await main();

import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { loadFixture, passTurn, startGame } from "./helpers";

/**
 * M5f: card animations at Normal speed (every other spec runs with them Off), the destroy
 * animation, the custom mat, the turn glow and landscape strategy zones.
 */
test.use({
  viewport: { width: 1440, height: 900 },
  // The default settings: animation Normal, turn glow on.
  storageState: { cookies: [], origins: [] },
});

/** Records every flight that appears (its card id and whether it shatters), from page load. */
async function watchFlights(page: Page) {
  await page.addInitScript(() => {
    const seen: { cardId: string | null; shatter: boolean; at: number }[] = [];
    (window as unknown as { flights: typeof seen }).flights = seen;
    new MutationObserver((records) => {
      for (const r of records)
        r.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const found = [
            ...(node.dataset["testid"] === "flight" ? [node] : []),
            ...node.querySelectorAll<HTMLElement>('[data-testid="flight"]'),
          ];
          for (const el of found)
            seen.push({
              cardId: el.dataset["cardId"] ?? null,
              shatter: el.dataset["shatter"] === "true",
              at: performance.now(),
            });
        });
    }).observe(document, { childList: true, subtree: true });
  });
}

const flights = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          flights: { cardId: string | null; shatter: boolean; at: number }[];
        }
      ).flights,
  );

/** Waits until no card is moving and input is unlocked. */
async function settled(page: Page) {
  await expect(page.getByTestId("flight")).toHaveCount(0);
  await expect(page.getByTestId("animation-lock")).toHaveCount(0);
}

/** Starting settings for a test; later changes (saved by the page) survive a reload. */
function settings(page: Page, values: Record<string, unknown>) {
  return page.addInitScript((text) => {
    if (window.localStorage.getItem("gojisim.settings") === null)
      window.localStorage.setItem("gojisim.settings", text);
  }, JSON.stringify(values));
}

/** Hotseat seed 2 plus one Pass: P1's turn 2 offers all five hand actions (the cover is off). */
async function hotseatTurn2(page: Page) {
  await page.goto("/play?mode=hotseat");
  await page.getByTestId("seed-input").fill("2");
  await startGame(page);
  await passTurn(page);
  await settled(page);
  await expect(page.getByTestId("board")).toHaveAttribute("data-bottom", "P1");
}

async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 - 20, {
    steps: 4,
  });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** The first hand card lit for a zone, its card id, and a lit zone for it. */
async function battleCardAndZone(page: Page) {
  const card = page
    .locator('[data-testid="hand-card"][data-hand-lit="true"]')
    .first();
  const cardId = await card.getByTestId("card").getAttribute("data-card-id");
  await card.click();
  const zone = page.locator('[data-lit][data-target^="zone:"]').first();
  const target = await zone.getAttribute("data-target");
  await page.keyboard.press("Escape");
  return {
    card,
    cardId: cardId ?? "",
    zone: page.getByTestId(`zone-P1-${target?.slice(5)}`),
  };
}

test.describe("card movement", () => {
  test.beforeEach(async ({ page }) => {
    await settings(page, { hotseatCover: false });
    await watchFlights(page);
  });

  test("drag and drop: the card flies from the drop point and settles into the slot, input locked meanwhile", async ({
    page,
  }) => {
    await hotseatTurn2(page);
    const { card, cardId, zone } = await battleCardAndZone(page);
    const before = (await flights(page)).length;
    await drag(page, card, zone);
    await expect(page.getByTestId("animation-lock")).toBeVisible();
    await settled(page);
    const moved = (await flights(page)).slice(before);
    expect(moved.map((f) => f.cardId)).toContain(cardId);
    const placed = zone.locator(`[data-card-id="${cardId}"]`);
    await expect(placed).toHaveCount(1);
    await expect(placed).toBeVisible();
  });

  test("Animation Off: the card is in place at once, and nothing flies", async ({
    page,
  }) => {
    // On top of this block's starting settings (no reload here).
    await page.addInitScript(() => {
      const saved = JSON.parse(
        window.localStorage.getItem("gojisim.settings") ?? "{}",
      ) as object;
      window.localStorage.setItem(
        "gojisim.settings",
        JSON.stringify({ ...saved, animation: "off" }),
      );
    });
    await hotseatTurn2(page);
    const { card, cardId, zone } = await battleCardAndZone(page);
    await drag(page, card, zone);
    await expect(zone.locator(`[data-card-id="${cardId}"]`)).toBeVisible();
    expect(await flights(page)).toEqual([]);
    await expect(page.getByTestId("animation-lock")).toHaveCount(0);
  });
});

test("a bot move animates, and its card ends up on the bot's mat", async ({
  page,
}) => {
  await settings(page, { botDelay: 0 });
  await watchFlights(page);
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("3");
  await startGame(page);
  // Pass until the bot has played a card to its mat.
  await expect
    .poll(
      async () => {
        const pass = page.getByTestId("pass");
        if (await pass.isVisible()) {
          await pass.click();
          const yes = page.getByTestId("confirm-yes");
          if (await yes.isVisible()) await yes.click();
        }
        for (const flight of await flights(page)) {
          if (!flight.cardId) continue;
          const onMat = page
            .getByTestId("mat-opp")
            .locator(`[data-testid="card"][data-card-id="${flight.cardId}"]`);
          if (await onMat.count()) return true;
        }
        return false;
      },
      { timeout: 30_000, intervals: [250] },
    )
    .toBe(true);
  await settled(page);
});

test("a destroy breaks the card apart, pulls it together, then it lands in the discard pile", async ({
  page,
}) => {
  await watchFlights(page);
  await loadFixture(page, "single-target");
  const option = page.getByTestId("choice-option").first();
  const cardId = await option.getAttribute("data-card-id");
  await option.click();
  await expect(
    page.locator('[data-testid="flight"][data-shatter="true"]'),
  ).toHaveCount(1);
  await settled(page);
  const shattered = (await flights(page)).filter((f) => f.shatter);
  expect(shattered.map((f) => f.cardId)).toEqual([cardId]);
  await expect(
    page.getByTestId("discard-P2").getByTestId("card"),
  ).toHaveAttribute("data-card-id", cardId ?? "");
});

test("destroy shards are angular polygons, laid out the same way on replay", async ({
  page,
}) => {
  /** Destroys the single target and reads the shards' shapes while they fly. */
  const shatter = async () => {
    await loadFixture(page, "single-target");
    await page.getByTestId("choice-option").first().click();
    const flight = page.locator('[data-testid="flight"][data-shatter="true"]');
    await expect(flight).toHaveCount(1);
    const shapes = await flight.evaluate((el) => ({
      seed: el.getAttribute("data-seed"),
      pieces: [...el.querySelectorAll<HTMLElement>("[data-piece]")].map(
        (p) => ({ sides: Number(p.dataset["sides"]), clip: p.style.clipPath }),
      ),
    }));
    await settled(page);
    return shapes;
  };
  const first = await shatter();
  expect(first.seed).toMatch(/^c\d+$/);
  expect(first.pieces.length).toBeGreaterThanOrEqual(12);
  for (const piece of first.pieces) expect(piece.clip).toMatch(/^polygon\(/);
  const sides = new Set(first.pieces.map((p) => p.sides));
  expect(sides.has(3)).toBe(true);
  expect([...sides].some((n) => n >= 4)).toBe(true);
  // Replaying the same game breaks the card the same way.
  expect(await shatter()).toEqual(first);
});

test("several destroys at once play together (ESD01-007's [enter])", async ({
  page,
}) => {
  await watchFlights(page);
  await loadFixture(page, "multi-destroy");
  const fixture = JSON.parse(
    readFileSync(
      new URL("./fixtures/multi-destroy.json", import.meta.url),
      "utf8",
    ),
  ) as { next: { optionId: string } };
  await page
    .locator(
      `[data-testid="choice-option"][data-option="${fixture.next.optionId}"]`,
    )
    .click();
  // Both shatters are on screen at the same time.
  await expect(
    page.locator('[data-testid="flight"][data-shatter="true"]'),
  ).toHaveCount(2);
  await settled(page);
  const shattered = (await flights(page)).filter((f) => f.shatter);
  expect(shattered).toHaveLength(2);
  expect(
    Math.abs((shattered[0]?.at ?? 0) - (shattered[1]?.at ?? 0)),
  ).toBeLessThan(50);
});

test.describe("custom mat", () => {
  // A 2 x 2 PNG.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DAwMDAxMDAAAAWAAPOBnGiAAAAAElFTkSuQmCC",
    "base64",
  );

  async function start(page: Page) {
    await page.goto("/play?mode=hotseat");
    await startGame(page);
    await page.getByTestId("settings").click();
  }

  test("an upload applies behind both mats, survives a reload, and resets", async ({
    page,
  }) => {
    await start(page);
    await expect(page.getByTestId("mat-image")).toHaveCount(0);
    await page
      .getByTestId("mat-upload")
      .setInputFiles({ name: "mat.png", mimeType: "image/png", buffer: png });
    await expect(page.getByTestId("mat-image")).toHaveCount(2);
    await expect(page.getByTestId("mat-image").first()).toHaveAttribute(
      "style",
      /blob:/,
    );
    await page.getByTestId("mat-scale").fill("150");
    await expect(page.getByTestId("mat-image").first()).toHaveAttribute(
      "style",
      /background-size: 150% auto/,
    );
    // Storage has caught up before the reload.
    await expect(page.getByTestId("mat-settings")).toHaveAttribute(
      "data-mat-stored",
      "true",
    );
    await page.reload();
    await start(page);
    await expect(page.getByTestId("mat-image")).toHaveCount(2);
    await expect(page.getByTestId("mat-image").first()).toHaveAttribute(
      "style",
      /background-size: 150% auto/,
    );
    await page.getByTestId("mat-reset").click();
    await expect(page.getByTestId("mat-image")).toHaveCount(0);
    // Storage has caught up before the reload.
    await expect(page.getByTestId("mat-settings")).toHaveAttribute(
      "data-mat-stored",
      "true",
    );
    await page.reload();
    await start(page);
    await expect(page.getByTestId("mat-image")).toHaveCount(0);
  });

  test("a file over the limit, or not an image, shows an error and keeps the mat", async ({
    page,
  }) => {
    await start(page);
    await page.getByTestId("mat-upload").setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(9 * 1024 * 1024),
    });
    await expect(page.getByTestId("mat-error")).toContainText("limit");
    await page
      .getByTestId("mat-upload")
      .setInputFiles({ name: "a.gif", mimeType: "image/gif", buffer: png });
    await expect(page.getByTestId("mat-error")).toContainText("PNG");
    await expect(page.getByTestId("mat-image")).toHaveCount(0);
  });

  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ] as const)
    test(`no scrolling with a custom mat at ${width}x${height}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await start(page);
      await page
        .getByTestId("mat-upload")
        .setInputFiles({ name: "mat.png", mimeType: "image/png", buffer: png });
      await expect(page.getByTestId("mat-image")).toHaveCount(2);
      // Close Settings, so only the board's own size counts.
      await page.getByTestId("settings").click();
      expect(
        await page.evaluate(() => ({
          y: document.documentElement.scrollHeight <= window.innerHeight,
          x: document.documentElement.scrollWidth <= window.innerWidth,
        })),
      ).toEqual({ y: true, x: true });
    });
});

test.describe("turn glow", () => {
  /** The mats that glow, as `<side>:<color>`. */
  const glowing = async (page: Page) => {
    const out: string[] = [];
    for (const side of ["you", "opp"]) {
      const glow = await page
        .getByTestId(`mat-${side}`)
        .getAttribute("data-glow");
      if (glow) out.push(`${side}:${glow}`);
    }
    return out;
  };

  test("only the turn player's mat glows, in their monster's colors, and it moves on turn change", async ({
    page,
  }) => {
    // A long bot delay keeps the bot's turn on screen.
    await settings(page, { botDelay: 3000 });
    await page.goto("/play?mode=bot");
    await page.getByTestId("seed-input").fill("4");
    await startGame(page);
    // Wait for the human's turn (the bot may go first).
    await expect(page.getByTestId("pass")).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => glowing(page))
      .toEqual([expect.stringMatching(/^you:(Red|grey)$/)]);
    // ESD01 is red: the glow cycles red and grey.
    const colors = new Set<string>();
    await expect
      .poll(
        async () => {
          for (const g of await glowing(page)) colors.add(g);
          return colors.size;
        },
        { timeout: 5000 },
      )
      .toBe(2);
    expect([...colors].sort()).toEqual(["you:Red", "you:grey"]);
    await page.getByTestId("pass").click();
    const yes = page.getByTestId("confirm-yes");
    if (await yes.isVisible()) await yes.click();
    // ESD02 is blue.
    await expect
      .poll(() => glowing(page))
      .toEqual([expect.stringMatching(/^opp:(Blue|grey)$/)]);
  });

  test("the setting turns it off", async ({ page }) => {
    await settings(page, { turnGlow: false });
    await page.goto("/play?mode=hotseat");
    await startGame(page);
    expect(await glowing(page)).toEqual([]);
  });
});

test("a strategy card in a strategy zone fills its landscape slot, uncropped", async ({
  page,
}) => {
  await settings(page, { hotseatCover: false });
  await hotseatTurn2(page);
  const card = page
    .locator('[data-testid="hand-card"]')
    .filter({ has: page.locator('[data-rotated="true"]') })
    .first();
  await card.click();
  await page.locator('[data-lit][data-target^="strategy:"]').first().click();
  await settled(page);
  const slots = page.locator('[data-testid^="strategy-P1-"]');
  await expect(slots.getByTestId("card")).toHaveCount(1);
  const slotEl = slots.filter({ has: page.getByTestId("card") });
  const placed = slotEl.getByTestId("card");
  await expect(placed).toBeVisible();
  await expect(placed).not.toHaveAttribute("data-rotated", /.*/);
  const slot = await slotEl.boundingBox();
  const box = await placed.boundingBox();
  const zone = await page.getByTestId("zone-P1-1").boundingBox();
  if (!slot || !box || !zone) throw new Error("no box");
  // The slot is landscape: a card height wide and a card width tall.
  expect(Math.abs(slot.width - zone.height)).toBeLessThanOrEqual(2);
  expect(Math.abs(slot.height - zone.width)).toBeLessThanOrEqual(2);
  // The card fills its slot's full width.
  expect(Math.abs(box.width - slot.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(box.height - slot.height)).toBeLessThanOrEqual(2);
  // Uncropped: the box has the printed image's aspect (when images are present; not on CI).
  const natural = await placed
    .locator("img")
    .evaluate((img: HTMLImageElement) => ({
      w: img.naturalWidth,
      h: img.naturalHeight,
    }));
  if (natural.w > 0)
    expect(
      Math.abs(box.width / box.height - natural.w / natural.h),
    ).toBeLessThan(0.02);
  // Its height is the board's card width, so the board still fits without scrolling.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight,
    ),
  ).toBe(true);
});

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const)
  test(`at ${width}x${height} every zone, strategy zone and pile sits inside its mat by the padding`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/play?mode=hotseat");
    await startGame(page);
    const pad = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(
          document.querySelector(".gojisim") as Element,
        ).getPropertyValue("--mat-pad"),
      ),
    );
    expect(pad).toBeGreaterThan(0);
    for (const side of ["you", "opp"]) {
      const mat = await page.getByTestId(`mat-${side}`).boundingBox();
      if (!mat) throw new Error(`no mat ${side}`);
      const cells = page.getByTestId(`mat-${side}`).getByTestId("mat-cell");
      // 8 zones, 2 strategy zones, the Rage zone, the deck, monster deck and discard pile.
      expect(await cells.count()).toBe(14);
      for (const cell of await cells.all()) {
        const box = await cell.boundingBox();
        if (!box) throw new Error("no cell box");
        const area = await cell.getAttribute("data-area");
        const margins = {
          left: box.x - mat.x,
          top: box.y - mat.y,
          right: mat.x + mat.width - (box.x + box.width),
          bottom: mat.y + mat.height - (box.y + box.height),
        };
        for (const [edge, margin] of Object.entries(margins))
          expect(
            margin,
            `${side} ${area} ${edge} margin ${margin} < ${pad}`,
          ).toBeGreaterThanOrEqual(pad - 0.5);
      }
    }
    expect(
      await page.evaluate(() => ({
        y: document.documentElement.scrollHeight <= window.innerHeight,
        x: document.documentElement.scrollWidth <= window.innerWidth,
      })),
    ).toEqual({ y: true, x: true });
  });

for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
] as const)
  test(`at ${width}x${height} hand cards fill the hand's height, within --hand-gap of its edges`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await settings(page, { hotseatCover: false, animation: "off" });
    await hotseatTurn2(page);
    const gap = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(
          document.querySelector(".gojisim") as Element,
        ).getPropertyValue("--hand-gap"),
      ),
    );
    expect(gap).toBeGreaterThan(0);
    const hand = await page.getByTestId("your-hand").boundingBox();
    if (!hand) throw new Error("no hand");
    const cards = page.getByTestId("your-hand").getByTestId("card");
    expect(await cards.count()).toBeGreaterThan(0);
    // The hand holds a strategy card (rotated): it follows the same rule.
    await expect(
      page.getByTestId("your-hand").locator('[data-rotated="true"]'),
    ).not.toHaveCount(0);
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      if (!box) throw new Error("no card box");
      const top = box.y - hand.y;
      const bottom = hand.y + hand.height - (box.y + box.height);
      // Within the gap (plus the hand's 1 px border), never past the edge.
      for (const margin of [top, bottom]) {
        expect(margin).toBeGreaterThanOrEqual(0);
        expect(margin).toBeLessThanOrEqual(gap + 1.5);
      }
    }
    expect(
      await page.evaluate(() => ({
        y: document.documentElement.scrollHeight <= window.innerHeight,
        x: document.documentElement.scrollWidth <= window.innerWidth,
      })),
    ).toEqual({ y: true, x: true });
  });

test.describe("collapsible battle log", () => {
  test.beforeEach(async ({ page }) => {
    await settings(page, { hotseatCover: false, animation: "off" });
  });

  const width = async (page: Page, id: string) =>
    (await page.getByTestId(id).boundingBox())?.width ?? 0;

  test("the button and L collapse and expand it; collapsed, the board widens and the state survives a reload", async ({
    page,
  }) => {
    await hotseatTurn2(page);
    await expect(page.getByTestId("log-panel")).toBeVisible();
    const open = {
      main: (await page.locator("main").boundingBox())?.width ?? 0,
      mat: await width(page, "mat-you"),
    };
    await page.getByTestId("log-collapse").click();
    await expect(page.getByTestId("log-panel")).toHaveCount(0);
    await expect(page.getByTestId("right-column")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    // The strip is thin, and the board takes the freed width. At 1440x900 --card-h is limited by
    // the height, so the cards keep their size (the next test widens a width-limited window).
    expect(await width(page, "right-column")).toBeLessThan(60);
    expect(
      (await page.locator("main").boundingBox())?.width ?? 0,
    ).toBeGreaterThan(open.main + 200);
    expect(await width(page, "mat-you")).toBeGreaterThanOrEqual(open.mat - 0.5);
    await page.getByTestId("log-expand").click();
    await expect(page.getByTestId("log-panel")).toBeVisible();
    expect(Math.abs((await width(page, "mat-you")) - open.mat)).toBeLessThan(1);
    await page.keyboard.press("l");
    await expect(page.getByTestId("log-panel")).toHaveCount(0);
    await page.reload();
    await page.getByTestId("seed-input").fill("2");
    await startGame(page);
    await expect(page.getByTestId("right-column")).toHaveAttribute(
      "data-collapsed",
      "true",
    );
    await page.keyboard.press("L");
    await expect(page.getByTestId("log-panel")).toBeVisible();
  });

  test("where the width limits the cards (1280x1300), collapsing makes them larger", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 1300 });
    await hotseatTurn2(page);
    const open = await width(page, "zone-P1-1");
    await page.getByTestId("log-collapse").click();
    // --card-h recomputes: the zones (and every card) grow by a quarter or more.
    expect(await width(page, "zone-P1-1")).toBeGreaterThan(open * 1.25);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true);
  });

  for (const [w, h] of [
    [1440, 900],
    [1920, 1080],
  ] as const)
    test(`collapsed at ${w}x${h}: no scrolling, and the preview opens over the right side of the board`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: w, height: h });
      await hotseatTurn2(page);
      await page.getByTestId("log-collapse").click();
      expect(
        await page.evaluate(() => ({
          y: document.documentElement.scrollHeight <= window.innerHeight,
          x: document.documentElement.scrollWidth <= window.innerWidth,
        })),
      ).toEqual({ y: true, x: true });
      await page.getByTestId("hand-card").first().hover();
      const preview = page.getByTestId("card-preview");
      await expect(preview).toBeVisible();
      const box = await preview.boundingBox();
      const strip = await page.getByTestId("right-column").boundingBox();
      if (!box || !strip) throw new Error("no box");
      // Left of the strip, over the board's right side.
      expect(box.x + box.width).toBeLessThanOrEqual(strip.x + 1);
      expect(box.x).toBeGreaterThan(w / 2);
    });
});

/** One sampled frame of a moving card. */
interface Sample {
  t: number;
  cardId: string | null;
  shatter: boolean;
  box: { x: number; y: number; width: number; height: number };
  from: number[];
  to: number[];
  /** The shards' combined box (a destroy). */
  shards: { x: number; y: number; width: number; height: number } | null;
  elapsed: number;
  moveAt: number;
  moveMs: number;
}

/** Samples every flight on every animation frame, from page load. */
async function sampleFlights(page: Page) {
  await page.addInitScript(() => {
    const samples: unknown[] = [];
    (window as unknown as { samples: unknown[] }).samples = samples;
    const frame = () => {
      const now = performance.now();
      document
        .querySelectorAll<HTMLElement>('[data-testid="flight"]')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          const pieces = [...el.querySelectorAll("[data-piece]")].map((p) =>
            p.getBoundingClientRect(),
          );
          const shards =
            pieces.length > 0
              ? (() => {
                  const x = Math.min(...pieces.map((p) => p.left));
                  const y = Math.min(...pieces.map((p) => p.top));
                  return {
                    x,
                    y,
                    width: Math.max(...pieces.map((p) => p.right)) - x,
                    height: Math.max(...pieces.map((p) => p.bottom)) - y,
                  };
                })()
              : null;
          samples.push({
            t: now,
            cardId: el.dataset["cardId"] ?? null,
            shatter: el.dataset["shatter"] === "true",
            box: { x: r.x, y: r.y, width: r.width, height: r.height },
            from: (el.dataset["from"] ?? "").split(",").map(Number),
            to: (el.dataset["to"] ?? "").split(",").map(Number),
            shards,
            elapsed: now - Number(el.dataset["started"] ?? now),
            moveAt: Number(el.dataset["moveAt"] ?? 0),
            moveMs: Number(el.dataset["moveMs"] ?? 0),
          });
        });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

const samplesOf = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { samples: Sample[] }).samples,
  ) as Promise<Sample[]>;

const inside = (
  p: { x: number; y: number },
  b: { x: number; y: number; width: number; height: number } | null,
) =>
  !!b &&
  p.x >= b.x &&
  p.x <= b.x + b.width &&
  p.y >= b.y &&
  p.y <= b.y + b.height;

test("moving cards keep the card's shape and size: draws on both sides, a bot play and a hand-to-discard move", async ({
  page,
}) => {
  await settings(page, { botDelay: 0 });
  await sampleFlights(page);
  await page.goto("/play?mode=bot");
  await page.getByTestId("seed-input").fill("3");
  await startGame(page);
  const box = async (id: string) => page.getByTestId(id).boundingBox();
  const places = async () => ({
    yourHand: await box("your-hand"),
    yourDiscard: await box("discard-P1"),
    oppHand: await box("opponent-hand"),
    oppMat: await box("mat-opp"),
  });
  const seen = new Set<string>();
  const kinds = async () => {
    const at = await places();
    for (const s of await samplesOf(page)) {
      const [x = 0, y = 0, w = 0, h = 0] = s.to;
      const end = { x: x + w / 2, y: y + h / 2 };
      if (s.cardId === null && inside(end, at.oppHand))
        seen.add("opponent draw");
      else if (s.cardId && inside(end, at.yourHand)) seen.add("your draw");
      else if (s.cardId && inside(end, at.oppMat)) seen.add("bot play");
      else if (s.cardId && inside(end, at.yourDiscard))
        seen.add("hand to discard");
    }
    return seen.size;
  };
  // Play until all four kinds of move have flown: gain rage when you can, else pass.
  await expect
    .poll(
      async () => {
        const pass = page.getByTestId("pass");
        if (await pass.isVisible()) {
          if (!seen.has("hand to discard")) {
            const cards = page.getByTestId("hand-card");
            for (const card of await cards.all()) {
              await card.click();
              const rage = page.locator('[data-lit][data-target="rage"]');
              if (await rage.count()) {
                await rage.first().click();
                break;
              }
              await page.keyboard.press("Escape");
            }
          } else {
            await pass.click();
            const yes = page.getByTestId("confirm-yes");
            if (await yes.isVisible()) await yes.click();
          }
        }
        return kinds();
      },
      { timeout: 40_000, intervals: [300] },
    )
    .toBe(4);
  const ratio = 63 / 88;
  const samples = await samplesOf(page);
  expect(samples.length).toBeGreaterThan(20);
  for (const s of samples) {
    const r = s.box.width / s.box.height;
    // Portrait or landscape, always the card's ratio (within 2 %).
    const off = Math.min(Math.abs(r / ratio - 1), Math.abs(r * ratio - 1));
    expect(off, `ratio ${r} for card ${s.cardId}`).toBeLessThan(0.02);
    const start = Math.max(s.from[2] ?? 0, s.from[3] ?? 0);
    const end = Math.max(s.to[2] ?? 0, s.to[3] ?? 0);
    const size = Math.max(s.box.width, s.box.height);
    expect(size).toBeGreaterThanOrEqual(Math.min(start, end) - 1);
    expect(size).toBeLessThanOrEqual(Math.max(start, end) + 1);
  }
});

test("a destroy explodes, hangs, then reassembles in flight: halfway, the shards are between the zone and the discard pile", async ({
  page,
}) => {
  await sampleFlights(page);
  await loadFixture(page, "single-target");
  const option = page.getByTestId("choice-option").first();
  const cardId = await option.getAttribute("data-card-id");
  await option.click();
  await settled(page);
  const samples = (await samplesOf(page)).filter((s) => s.shatter && s.shards);
  expect(samples.length).toBeGreaterThan(10);
  const first = samples[0] as Sample;
  const [fx = 0, fy = 0, fw = 0, fh = 0] = first.from;
  const [tx = 0, ty = 0, tw = 0, th = 0] = first.to;
  const source = { x: fx, y: fy, width: fw, height: fh };
  const a = { x: fx + fw / 2, y: fy + fh / 2 };
  const b = { x: tx + tw / 2, y: ty + th / 2 };
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const centerOf = (s: Sample) => ({
    x: (s.shards?.x ?? 0) + (s.shards?.width ?? 0) / 2,
    y: (s.shards?.y ?? 0) + (s.shards?.height ?? 0) / 2,
  });
  // While hanging (after the explosion, before the move), the shards are still at the zone.
  const hanging = samples.filter(
    (s) => s.elapsed > s.moveAt - 150 && s.elapsed < s.moveAt - 20,
  );
  expect(hanging.length).toBeGreaterThan(0);
  for (const s of hanging) expect(inside(centerOf(s), source)).toBe(true);
  // Halfway through the reassembly they are in between, no longer over the zone.
  const mid = first.moveAt + first.moveMs / 2;
  const halfway = samples.reduce((best, s) =>
    Math.abs(s.elapsed - mid) < Math.abs(best.elapsed - mid) ? s : best,
  );
  expect(Math.abs(halfway.elapsed - mid)).toBeLessThan(60);
  const c = centerOf(halfway);
  expect(inside(c, source)).toBe(false);
  const along =
    ((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / (span * span);
  expect(along).toBeGreaterThan(0.2);
  expect(along).toBeLessThan(0.8);
  // At the end, one card is in the discard pile.
  await expect(page.getByTestId("discard-P2").getByTestId("card")).toHaveCount(
    1,
  );
  await expect(
    page.getByTestId("discard-P2").getByTestId("card"),
  ).toHaveAttribute("data-card-id", cardId ?? "");
});

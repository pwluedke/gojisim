import { expect, type Page, test } from "@playwright/test";
import { loadFixture, vsBot } from "./helpers";

/**
 * Sound effects with a stubbed `AudioContext`: it records each context made, each file decoded
 * (by the URL it was fetched from) and each sound started, and the volume gain. Animations stay
 * off, so sounds play at the step.
 */

const storage = (settings: Record<string, unknown>) => ({
  cookies: [],
  origins: [
    {
      origin: "http://localhost:5179",
      localStorage: [
        {
          name: "gojisim.settings",
          value: JSON.stringify({ animation: "off", ...settings }),
        },
      ],
    },
  ],
});

test.use({ viewport: { width: 1440, height: 900 }, storageState: storage({}) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __audio: {
        contexts: number;
        decoded: number;
        played: string[];
        gain: number;
      };
    };
    w.__audio = { contexts: 0, decoded: 0, played: [], gain: -1 };
    const urls = new WeakMap<ArrayBuffer, string>();
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const response = await realFetch(input, init);
      const url = String(input instanceof Request ? input.url : input);
      if (!url.includes("/sounds/")) return response;
      const data = await response.arrayBuffer();
      urls.set(data, url.split("/").pop() ?? url);
      const copy = new Response(data, { status: response.status });
      // The same buffer comes back, so the decode can name its file.
      copy.arrayBuffer = () => Promise.resolve(data);
      return copy;
    };
    class FakeContext {
      destination = {};
      constructor() {
        w.__audio.contexts++;
      }
      resume() {
        return Promise.resolve();
      }
      createGain() {
        const node = {
          gain: {
            set value(v: number) {
              w.__audio.gain = v;
            },
            get value() {
              return w.__audio.gain;
            },
          },
          connect() {},
        };
        return node;
      }
      decodeAudioData(data: ArrayBuffer) {
        w.__audio.decoded++;
        return Promise.resolve({ file: urls.get(data) });
      }
      createBufferSource() {
        const source = {
          buffer: null as { file?: string } | null,
          connect() {},
          start() {
            w.__audio.played.push(source.buffer?.file ?? "?");
          },
        };
        return source;
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
});

const audio = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __audio: {
            contexts: number;
            decoded: number;
            played: string[];
            gain: number;
          };
        }
      ).__audio,
  );

/** A harmless click (on the header bar) unlocks audio; then all 16 files load. */
async function unlock(page: Page) {
  await page.mouse.click(400, 20);
  await expect.poll(async () => (await audio(page)).decoded).toBe(16);
}

/** The saved Sound setting. */
const savedSound = (page: Page) =>
  page.evaluate(
    () =>
      (
        JSON.parse(localStorage.getItem("gojisim.settings") ?? "{}") as {
          sound?: boolean;
        }
      ).sound,
  );

test("nothing plays, and no audio starts, before the first click", async ({
  page,
}) => {
  await loadFixture(page, "single-target");
  await page.waitForTimeout(500);
  expect(await audio(page)).toMatchObject({ contexts: 0, played: [] });
  await unlock(page);
  expect((await audio(page)).contexts).toBe(1);
});

test("a battle card play thuds and a destroy crunches", async ({ page }) => {
  // A hand of five at your play timing (the m5f fixture).
  await loadFixture(page, "hand-five");
  await unlock(page);
  // The first lit hand card that lights a zone: a battle card.
  const zone = page.locator('[data-lit][data-target^="zone:"]').first();
  for (const card of await page
    .locator('[data-testid="hand-card"][data-hand-lit="true"]')
    .all()) {
    await card.click();
    if (await zone.isVisible()) break;
    await page.keyboard.press("Escape");
  }
  await zone.click();
  await expect
    .poll(async () => (await audio(page)).played)
    .toContain("card-play.mp3");

  await loadFixture(page, "single-target");
  await unlock(page);
  await page.getByTestId("choice-option").first().click();
  await expect
    .poll(async () => (await audio(page)).played)
    .toContain("destroy.mp3");
});

test("M mutes and unmutes; muted, a destroy plays nothing", async ({
  page,
}) => {
  await loadFixture(page, "single-target");
  await unlock(page);
  await page.keyboard.press("m");
  await expect.poll(() => savedSound(page)).toBe(false);
  await page.getByTestId("choice-option").first().click();
  await expect(page.getByTestId("choice-modal")).toHaveCount(0);
  await page.waitForTimeout(300);
  expect((await audio(page)).played).toEqual([]);
  await page.keyboard.press("M");
  await expect.poll(() => savedSound(page)).toBe(true);
});

test("the Sound toggle and the Volume slider are saved", async ({ page }) => {
  await vsBot(page, 2);
  await page.getByTestId("settings").click();
  await expect(page.getByTestId("setting-sound")).toBeChecked();
  await expect(page.getByTestId("setting-volume")).toHaveValue("50");
  await page.getByTestId("setting-volume").fill("20");
  await expect.poll(async () => (await audio(page)).gain).toBe(0.2);
  await page.getByTestId("setting-sound").uncheck();
  await vsBot(page, 2);
  await page.getByTestId("settings").click();
  await expect(page.getByTestId("setting-sound")).not.toBeChecked();
  await expect(page.getByTestId("setting-volume")).toHaveValue("20");
});

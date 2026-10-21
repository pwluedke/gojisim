import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CardListSchema } from "@gojisim/cards";
import sharp from "sharp";
import { PoliteFetcher } from "./fetcher";

const cacheDir = fileURLToPath(new URL("../.cache/", import.meta.url));
const dataDir = new URL("../../../packages/cards/data/", import.meta.url);
const publicDir = fileURLToPath(
  new URL("../../../apps/web/public/cards/", import.meta.url),
);

export const THUMB_WIDTH = 300;

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export interface ImageSizes {
  /** Original PNG size in bytes. */
  png: number;
  /** `<id>-full.webp` (original dimensions) size in bytes. */
  full: number;
  /** `<id>-thumb.webp` (300 px wide) size in bytes. */
  thumb: number;
}

interface Failure {
  id: number;
  imageUrl: string;
  error: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** `.../original/<set>/<id>.png` -> `<set>/<id>.png` */
function cachePathFor(imageUrl: string): string {
  const [set, file] = new URL(imageUrl).pathname.split("/").slice(-2);
  if (!set || !file) throw new Error(`Unexpected image URL ${imageUrl}`);
  return `${cacheDir}images/${set}/${file}`;
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const cards = CardListSchema.parse(
    JSON.parse(await readFile(new URL("cards.json", dataDir), "utf8")),
  ).sort((a, b) => a.id - b.id);
  const fetcher = new PoliteFetcher({ cacheDir, minIntervalMs: 1000 });
  const manifest: Record<string, ImageSizes> = {};
  const failures: Failure[] = [];
  const startedAt = Date.now();

  await mkdir(publicDir, { recursive: true });
  for (const [index, card] of cards.entries()) {
    try {
      const pngPath = cachePathFor(card.imageUrl);
      if (!(await exists(pngPath))) {
        const bytes = await fetcher.getBytes(card.imageUrl);
        if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
          throw new Error("Response is not a PNG");
        }
        await mkdir(dirname(pngPath), { recursive: true });
        await writeFile(pngPath, bytes);
      }

      const fullPath = `${publicDir}${card.id}-full.webp`;
      const thumbPath = `${publicDir}${card.id}-thumb.webp`;
      if (force || !(await exists(fullPath))) {
        await sharp(pngPath).webp().toFile(fullPath);
      }
      if (force || !(await exists(thumbPath))) {
        await sharp(pngPath)
          .resize({ width: THUMB_WIDTH })
          .webp()
          .toFile(thumbPath);
      }

      manifest[card.id] = {
        png: (await stat(pngPath)).size,
        full: (await stat(fullPath)).size,
        thumb: (await stat(thumbPath)).size,
      };
    } catch (err) {
      failures.push({
        id: card.id,
        imageUrl: card.imageUrl,
        error: String(err),
      });
    }
    if ((index + 1) % 50 === 0 || index + 1 === cards.length) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(
        `${index + 1}/${cards.length} (${fetcher.networkRequests} downloaded, ${failures.length} failed, ${elapsed}s)`,
      );
    }
  }

  await writeFile(
    new URL("images.json", dataDir),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  const totals = Object.values(manifest).reduce(
    (sum, s) => ({
      png: sum.png + s.png,
      full: sum.full + s.full,
      thumb: sum.thumb + s.thumb,
    }),
    { png: 0, full: 0, thumb: 0 },
  );
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  console.log(
    `\nConverted ${Object.keys(manifest).length}/${cards.length} images.`,
  );
  console.log(
    `PNG ${mb(totals.png)} | WebP full ${mb(totals.full)} | WebP thumb ${mb(totals.thumb)}`,
  );
  if (failures.length > 0) {
    console.error(`${failures.length} failures:`, failures);
    process.exitCode = 1;
  }
}

await main();

import { access, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * The official First / Second cards and card back (TOHO art, so never in git, like the card
 * images). Paul puts the source files in the gitignored `apps/web/public/cards/official-src/`;
 * this converts them next to it into the WebPs the app loads (sharp's defaults, decision 21):
 * `<name>.webp` at full size and `<name>-thumb.webp` 300 px wide.
 */
export const OFFICIAL_IMAGES: Record<string, string> = {
  "first-1": "first-godzilla-vs-godzilla.png",
  "first-2": "first-resonance-of-rivals.png",
  "second-1": "second-monsters-raid-again.png",
  "second-2": "second-endless-wars.png",
  back: "card-back.webp",
};

const THUMB_WIDTH = 300;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Converts the official images found in `sourceDir` into `publicDir`, skipping WebPs that
 * already exist unless `force`. Returns the names converted and the source files missing.
 */
export async function convertOfficialImages(
  sourceDir: string,
  publicDir: string,
  force = false,
): Promise<{ converted: string[]; missing: string[] }> {
  const converted: string[] = [];
  const missing: string[] = [];
  await mkdir(publicDir, { recursive: true });
  for (const [name, file] of Object.entries(OFFICIAL_IMAGES)) {
    const source = `${sourceDir}${file}`;
    if (!(await exists(source))) {
      missing.push(file);
      continue;
    }
    const full = `${publicDir}${name}.webp`;
    const thumb = `${publicDir}${name}-thumb.webp`;
    if (force || !(await exists(full))) await sharp(source).webp().toFile(full);
    if (force || !(await exists(thumb)))
      await sharp(source).resize({ width: THUMB_WIDTH }).webp().toFile(thumb);
    converted.push(name);
  }
  return { converted, missing };
}

const publicDir = fileURLToPath(
  new URL("../../../apps/web/public/cards/", import.meta.url),
);
export const OFFICIAL_SOURCE_DIR = `${publicDir}official-src/`;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { converted, missing } = await convertOfficialImages(
    OFFICIAL_SOURCE_DIR,
    publicDir,
    process.argv.includes("--force"),
  );
  console.log(`Official images: ${converted.join(", ") || "none"}.`);
  if (missing.length > 0)
    console.log(
      `Not in ${OFFICIAL_SOURCE_DIR}: ${missing.join(", ")}. The app falls back to its drawn backs and First / Second faces.`,
    );
}

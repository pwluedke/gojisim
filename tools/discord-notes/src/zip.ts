import { inflateRawSync } from "node:zlib";

/**
 * A minimal zip reader (#84), so Discrub's zips are read as they are, with no unzip step and no
 * dependency: the central directory, then each file stored (method 0) or deflated (method 8).
 * Zip64 archives and encrypted entries are refused with a plain error.
 */

export interface ZipEntry {
  /** Path inside the archive, with "/" separators. */
  name: string;
  data: Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(zip: Buffer): ZipEntry[] {
  // The end-of-central-directory record is in the last 22 bytes plus a comment of up to 65,535.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--)
    if (zip.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("not a zip file (no end of central directory)");
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (count === 0xffff || at === 0xffffffff)
    throw new Error("zip64 archives aren't supported");
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== CENTRAL)
      throw new Error("broken zip central directory");
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new Error(`${name} is encrypted`);
    if (zip.readUInt32LE(local) !== LOCAL)
      throw new Error(`broken zip entry ${name}`);
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    if (method === 0) entries.push({ name, data: Buffer.from(raw) });
    else if (method === 8) entries.push({ name, data: inflateRawSync(raw) });
    else throw new Error(`${name}: zip method ${method} isn't supported`);
  }
  return entries;
}

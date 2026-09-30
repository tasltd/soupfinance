#!/usr/bin/env node
/**
 * Write each guide screenshot's real pixel size into its <img> tag (SOUPFIN-81).
 *
 * Without width/height the browser cannot reserve space for an image before it
 * loads. A "Need Help?" link opens the guide at #section; the images above
 * that section then load, push it down, and the reader lands on the wrong part
 * of the page. With the attributes, the layout is final before any image loads.
 *
 * Run after re-capturing the guide screenshots (e2e/user-guide-screenshots.spec.ts):
 *   node scripts/size-user-guide-images.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUIDE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'user-guide');

/** Width and height of a baseline or progressive JPEG, read from its SOF marker. */
export function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('Not a JPEG');
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error(`Bad JPEG marker at ${offset}`);
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error('No frame header found');
}

/** The guide HTML with width/height on every images/ screenshot set to the file's size. */
export function sizeGuideImages(html, guideDir = GUIDE_DIR) {
  return html.replace(/<img src="(images\/[^"]+)"[^>]*>/g, (tag, src) => {
    const { width, height } = jpegSize(readFileSync(join(guideDir, src)));
    const bare = tag.replace(/\s(width|height)="\d+"/g, '').replace(/\s*>$/, '');
    return `${bare} width="${width}" height="${height}">`;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = join(GUIDE_DIR, 'index.html');
  const before = readFileSync(file, 'utf8');
  const after = sizeGuideImages(before);
  writeFileSync(file, after);
  console.log(after === before ? 'Guide image sizes already up to date.' : 'Updated guide image sizes.');
}

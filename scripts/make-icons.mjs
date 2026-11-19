// Builds the PWA icons in public/icons from the logo badge (public/brand/supladitos-badge.png).
// Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const src = 'public/brand/supladitos-badge.png'
const out = 'public/icons'
mkdirSync(out, { recursive: true })

const white = { r: 255, g: 255, b: 255, alpha: 1 }

// The source PNG is RGB with black corners: cut it to its round disc so the
// corners are transparent. The disc is inset slightly to drop the dark rim.
const meta = await sharp(src).metadata()
const d = meta.width
const mask = Buffer.from(
  `<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 3}" fill="#fff"/></svg>`,
)
const disc = await sharp(src).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
await sharp(disc).toFile('public/brand/supladitos-badge-round.png')

// "any" icons: the round badge on a transparent square, as on the menu.
for (const size of [192, 512]) {
  await sharp(disc).resize(size, size, { kernel: 'lanczos3' }).png().toFile(`${out}/icon-${size}.png`)
}

// Maskable: the badge inside the 80% safe zone on a white square (the badge is
// always shown on white, in both themes).
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.78)
  const badge = await sharp(disc).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: white } })
    .composite([{ input: badge, gravity: 'center' }])
    .png()
    .toFile(`${out}/maskable-${size}.png`)
}

// Apple touch icon (iOS ignores transparency and masks its own corners).
{
  const size = 180
  const inner = Math.round(size * 0.86)
  const badge = await sharp(disc).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: white } })
    .composite([{ input: badge, gravity: 'center' }])
    .png()
    .toFile(`${out}/apple-touch-icon.png`)
}

// Favicon
await sharp(disc).resize(48, 48).png().toFile('public/favicon.png')
console.log('Icons written to', out)

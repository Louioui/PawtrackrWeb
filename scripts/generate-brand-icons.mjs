import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#161321" />
      <stop offset="50%" stop-color="#0E0C14" />
      <stop offset="100%" stop-color="#07060A" />
    </linearGradient>

    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B95FF" stop-opacity="0.6" />
      <stop offset="50%" stop-color="#6366F1" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#8B95FF" stop-opacity="0.05" />
    </linearGradient>

    <radialGradient id="centerGlow" cx="50%" cy="54%" r="42%">
      <stop offset="0%" stop-color="#8B95FF" stop-opacity="0.32" />
      <stop offset="60%" stop-color="#6366F1" stop-opacity="0.12" />
      <stop offset="100%" stop-color="#8B95FF" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="pawGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E0E7FF" />
      <stop offset="45%" stop-color="#A5B4FC" />
      <stop offset="100%" stop-color="#8B95FF" />
    </linearGradient>

    <linearGradient id="accentGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#C7D2FE" />
      <stop offset="100%" stop-color="#8B95FF" />
    </linearGradient>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Obsidian Rounded Squircle Badge -->
  <rect x="20" y="20" width="472" height="472" rx="112" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="4" />

  <!-- Ambient Radial Glow Behind Paw -->
  <circle cx="256" cy="276" r="170" fill="url(#centerGlow)" />

  <!-- Brand Paw Icon Geometry -->
  <g filter="url(#softGlow)">
    <!-- Central Main Pad -->
    <path d="M 256 232 C 214 232 182 268 192 312 C 200 348 226 368 256 368 C 286 368 312 348 320 312 C 330 268 298 232 256 232 Z" fill="url(#pawGrad)" />

    <!-- Toe 1: Far Left -->
    <ellipse cx="182" cy="198" rx="27" ry="38" transform="rotate(-24 182 198)" fill="url(#pawGrad)" />

    <!-- Toe 2: Center Left -->
    <ellipse cx="228" cy="162" rx="28" ry="42" transform="rotate(-8 228 162)" fill="url(#pawGrad)" />

    <!-- Toe 3: Center Right -->
    <ellipse cx="284" cy="162" rx="28" ry="42" transform="rotate(8 284 162)" fill="url(#pawGrad)" />

    <!-- Toe 4: Far Right -->
    <ellipse cx="330" cy="198" rx="27" ry="38" transform="rotate(24 330 198)" fill="url(#pawGrad)" />
  </g>

  <!-- Modern Luxury Tech Accent (Star Sparkle at Top Right) -->
  <path d="M 374 100 Q 374 116 390 116 Q 374 116 374 132 Q 374 116 358 116 Q 374 116 374 100 Z" fill="url(#accentGlow)" opacity="0.85" />
</svg>`;

async function main() {
  const publicDir = path.resolve('public');

  // 1. Write SVG
  const svgPath = path.join(publicDir, 'icon.svg');
  fs.writeFileSync(svgPath, SVG_CONTENT, 'utf8');
  console.log('✓ Created public/icon.svg');

  // 2. Generate PNG 512x512
  const png512 = await sharp(Buffer.from(SVG_CONTENT))
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), png512);
  console.log('✓ Created public/icon-512.png');

  // 3. Generate PNG 192x192
  const png192 = await sharp(Buffer.from(SVG_CONTENT))
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);
  console.log('✓ Created public/icon-192.png');

  // 4. Generate Apple Touch Icon 180x180
  const appleTouch = await sharp(Buffer.from(SVG_CONTENT))
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouch);
  console.log('✓ Created public/apple-touch-icon.png');

  // 5. Generate Favicon (32x32 PNG as standard favicon)
  const favicon32 = await sharp(Buffer.from(SVG_CONTENT))
    .resize(32, 32)
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), favicon32);
  console.log('✓ Created public/favicon.ico');

  console.log('All brand icons generated successfully.');
}

main().catch((err) => {
  console.error('Error generating brand icons:', err);
  process.exit(1);
});

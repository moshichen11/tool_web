const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("theme exposes Semi-inspired starry dark semantic colors", () => {
  assert.match(html, /--semi-color-primary:\s*#8f8de8/i);
  assert.match(html, /--semi-color-bg-0:\s*#0b0d1c/i);
  assert.match(html, /--semi-color-text-0:\s*#f4f2ff/i);
  assert.match(html, /--glass-blur:\s*26px/i);
  assert.match(html, /--glass-highlight:/i);
});

test("page composes a layered indigo nebula gradient", () => {
  assert.match(html, /body\s*\{[^}]*radial-gradient\(ellipse at 8% 10%,\s*rgba\(85,\s*104,\s*214/s);
  assert.match(html, /body\s*\{[^}]*linear-gradient\(145deg,\s*#090b18/s);
  assert.match(html, /body::before\s*\{[^}]*radial-gradient\(circle at 12% 18%/s);
  assert.doesNotMatch(html, /深色自然玻璃主题最终覆盖层/);
});

test("glass panels use visible starry translucency and gradient borders", () => {
  assert.match(html, /\.glass\s*\{[^}]*linear-gradient\(145deg,\s*rgba\(28,\s*31,\s*69,\s*0\.58\)/s);
  assert.match(html, /\.glass\s*\{[^}]*backdrop-filter:\s*blur\(var\(--glass-blur\)\)/s);
  assert.match(html, /\/\* 深色星空玻璃主题最终覆盖层。 \*\//);
  assert.match(html, /\.feature-sidebar\s*\{[^}]*rgba\(24,\s*27,\s*65,\s*0\.5\)/s);
  assert.match(html, /\.site-card\s*\{[^}]*rgba\(31,\s*35,\s*78,\s*0\.44\)/s);
});

test("controls use indigo gradients and accessible focus states", () => {
  assert.match(html, /\.feature-button\.active\s*\{[^}]*linear-gradient\(135deg,\s*rgba\(143,\s*141,\s*232/s);
  assert.match(html, /\.input:focus,[\s\S]*?box-shadow:\s*var\(--focus-ring\)/);
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("reduced motion disables decoration without removing wheel and card interactions", () => {
  const start = html.indexOf("@media (prefers-reduced-motion: reduce)");
  const end = html.indexOf("</style>", start);
  const block = html.slice(start, end);

  assert.notEqual(start, -1, "Missing reduced-motion media query");
  assert.match(block, /body::after,[\s\S]*?\.magic-circle svg[\s\S]*?animation:\s*none !important/);
  assert.doesNotMatch(block, /\*::before/);
  assert.doesNotMatch(block, /transition-duration:\s*0\.01ms !important/);
  assert.doesNotMatch(block, /\.wheel-disc/);
  assert.doesNotMatch(block, /\.memory-card-inner/);
  assert.match(html, /\.wheel-disc\s*\{[^}]*transition:\s*transform var\(--wheel-spin-duration, 4s\)/s);
  assert.match(html, /\.memory-card-inner\s*\{[^}]*transition:\s*transform 0\.62s/s);
});

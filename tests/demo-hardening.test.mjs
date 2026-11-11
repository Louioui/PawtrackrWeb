import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { containsMarkup } from '../src/lib/input-safety.ts';

test('markup-like names are detected, ordinary names are not', () => {
  for (const bad of ['<script>alert(1)</script>', 'Rex <3', 'a > b', '<img src=x onerror=alert(1)>']) assert.equal(containsMarkup(bad), true, bad);
  for (const ok of ["O'Brien", 'Mrs. Chen-Alvarez', 'Bello (Pup)', 'Café Paws', '', 'Rex & Milo']) assert.equal(containsMarkup(ok), false, ok);
});

test('the founder command panel is hidden in production', () => {
  const layout = readFileSync(new URL('../src/app/admin/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /NODE_ENV === 'production'\) notFound\(\)/);
});

test('the sample salon badge no longer claims tenant isolation', () => {
  const dashboard = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(dashboard, /TENANT ISOLATED/);
  assert.match(dashboard, /SAMPLE SALON:/);
});

test('the booking route refuses markup in every name field', () => {
  const route = readFileSync(new URL('../src/app/api/bookings/route.ts', import.meta.url), 'utf8');
  assert.match(route, /\[clientName, petName, secondPetName\]\.some\(\(value\) => containsMarkup\(value\)\)/);
});

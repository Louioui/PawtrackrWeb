import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { containsMarkup } from '../src/lib/input-safety.ts';
import { handleAdminRequest } from '../src/lib/admin-guard.ts';

test('markup-like names are detected, ordinary names are not', () => {
  for (const bad of ['<script>alert(1)</script>', 'Rex <3', 'a > b', '<img src=x onerror=alert(1)>']) assert.equal(containsMarkup(bad), true, bad);
  for (const ok of ["O'Brien", 'Mrs. Chen-Alvarez', 'Bello (Pup)', 'Café Paws', '', 'Rex & Milo']) assert.equal(containsMarkup(ok), false, ok);
});

test('the founder command panel returns 404 in production and 200 in development via request-level checks', async () => {
  let serverEnv = 'production';
  const server = http.createServer((req, res) => {
    if (req.url === '/admin') {
      const decision = handleAdminRequest(serverEnv);
      res.writeHead(decision.status, { 'Content-Type': 'text/plain' });
      res.end(decision.allowed ? 'Founder Super-Admin Console' : 'Not Found');
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify production build request returns 404
    serverEnv = 'production';
    const prodRes = await fetch(`${baseUrl}/admin`);
    assert.equal(prodRes.status, 404);

    // 2. Verify development request returns 200 and route remains available
    serverEnv = 'development';
    const devRes = await fetch(`${baseUrl}/admin`);
    assert.equal(devRes.status, 200);
    const devBody = await devRes.text();
    assert.match(devBody, /Founder Super-Admin/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // Verify dashboard link is hidden in production
  const dashboard = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /process\.env\.NODE_ENV !== 'production'[\s\S]*?Founder Super-Admin/);

  // Verify admin layout uses the guard and notFound()
  const layout = readFileSync(new URL('../src/app/admin/layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /handleAdminRequest\(\)/);
  assert.match(layout, /notFound\(\)/);
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

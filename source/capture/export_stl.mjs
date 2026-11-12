// Saves printable STL files produced by the running demo (same code path as the in-page download buttons).
//   node export_stl.mjs <outDir> [clip=Jog_Fwd_Loop]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2], clipName = process.argv[3] || 'Jog_Fwd_Loop';
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11'], defaultViewport: { width: 640, height: 360 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
await page.goto(`http://localhost:${process.env.PORT || 8765}/?capture&q=low&clip=${clipName}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
await page.evaluate(() => { window.__keepSTL = true; });
const N = await page.evaluate(() => zmd.ring().N);
const save = (r) => { fs.writeFileSync(path.join(out, r.name), Buffer.from(r.b64, 'base64')); console.log(r.name, r.bytes, 'bytes', r.tris, 'tris'); };
for (let p = 0; p < N; p++) save(await page.evaluate((i) => zmd.exportOne(i, 80), p));
save(await page.evaluate(() => zmd.exportRing(180)));
await browser.close();

// Headless check of the running demo: steps frames deterministically and saves screenshots.
//   node shot.mjs <outDir> [url-query] [WxH]
// Runs a small JS "script" passed via SHOT_SCRIPT env (JSON array of steps):
//   {"frames":120}  {"eval":"zmd.setStrobe(true)"}  {"shot":"name"}
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2];
const query = process.argv[3] || 'capture&q=high';
const [W, H] = (process.argv[4] || '1920x1080').split('x').map(Number);
const steps = JSON.parse(process.env.SHOT_SCRIPT || '[{"frames":90},{"shot":"candle"},{"eval":"zmd.setStrobe(true)"},{"frames":40},{"shot":"strobe"}]');
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--hide-scrollbars', '--mute-audio', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.type(), m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${process.env.PORT || 8765}/?${query}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
console.log('renderer:', await page.evaluate(() => { const g = zmd.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; }));
await page.evaluate(() => { zmd.S.fade = 1; });
for (const s of steps) {
  if (s.eval) console.log('eval ->', JSON.stringify(await page.evaluate(s.eval)));
  if (s.frames) {
    const t0 = Date.now();
    await page.evaluate(async (n, dt) => { for (let i = 0; i < n; i++) { window.__frame(dt); if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0)); } }, s.frames, s.dt || 1 / 60);
    console.log(`${s.frames} frames in ${Date.now() - t0} ms`);
  }
  if (s.shot) { await page.screenshot({ path: path.join(out, s.shot + '.png') }); console.log('shot', s.shot); }
}
await browser.close();

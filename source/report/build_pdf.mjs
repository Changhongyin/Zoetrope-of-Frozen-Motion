// Renders report.html to PDF with headless Edge.   node build_pdf.mjs <report.html> <out.pdf>
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';

const [src, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: process.env.EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new' });
const page = await browser.newPage();
await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle0' });
const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src')));
if (broken.length) console.log('BROKEN IMAGES:', broken);
// report any text block that overflows its page
const over = await page.evaluate(() => [...document.querySelectorAll('section')].map((s, i) => [i + 1, s.scrollHeight - s.clientHeight]).filter((x) => x[1] > 1));
if (over.length) console.log('OVERFLOWING PAGES [page, px]:', JSON.stringify(over));
await page.pdf({ path: out, width: '297mm', height: '167mm', printBackground: true, preferCSSPageSize: true });
if (process.argv[4]) {   // optional: PNG of every page for visual inspection
  await page.setViewport({ width: 1123, height: 632, deviceScaleFactor: 1.5 });
  const secs = await page.$$('section');
  for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: `${process.argv[4]}/p${i + 1}.png` });
}
await browser.close();
console.log('pdf written', out);

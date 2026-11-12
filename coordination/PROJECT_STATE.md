# PROJECT_STATE — 走马灯 (Zoetrope)

## Chosen brief (LOCKED after the core proof passed, see review/01_*)
- **Title:** 《走马灯》 / Zoetrope of Frozen Motion
- **Audience:** people curious how animation works; makers with a 3D printer; judges/players in a browser.
- **Promise:** spin a lantern wheel of AI-made statues by hand; open the shutter and the frozen statues come alive.
- **Signature moment:** steady light = spinning blur; shutter on = the ring of static sculptures becomes one running child.
- **Lux3D role (core):** concept image -> image-to-3D -> humanoid auto-rig -> animation retarget (8 loops) -> print export; lantern also image -> 3D.
- **Medium:** three.js web demo + 1080p60 video recorded from the running page + printable STL set.
- **Scope boundary:** one lantern, one character, 8 motions. No live generation in the public demo. No physical print claimed. No new features.

## Ideas considered
1. Zoetrope of Lux3D-rigged statues (chosen). 2. Part-split take-apart toy puzzle. 3. Gaussian-splat memory jar.

## Confirmed facts
- Host: Windows VM AIMED, share read/write OK, LUX3D_CN_API_KEY present (never written to the share).
- API: https://api.aholo3d.cn, spec in references/aholo-api/. No balance/quote endpoint exists; cost is read per task from task/list `consumedCredits`.
- Rules page https://www.aholo3d.cn/hackathon is client-rendered and could not be fetched; rules used are from the user's screenshots (weights 30/25/20/20/5, deadline Nov 19 19:00, track list, 500 MB source zip). Year/timezone and video/report size limits NOT independently verified.

## Lux3D tasks (all succeeded first time; 86 credits total)
6656052 image (kid) 12 | 6656685 img-to-3d G1 (kid) 20 | 6659006 auto-rig 15 | 6659806 retarget x8 6 |
6661057 image (lantern) 12 | 6661658 img-to-3d G1 (lantern) 20 | 6663902 multi-format export STL+3MF 1

## Canonical files
- Demo: source/web/ (index.html, main.js, director.js, style.css, assets/, vendor/); run `python source/web/serve.py 8765`
- Lux3D: source/lux3d/*.py, raw outputs + ledger in assets/lux3d/
- Capture: source/capture/{capture,shot,export_stl}.mjs (run from a folder that has puppeteer-core)
- Report: source/report/report.html + build_pdf.mjs
- Local scratch (to delete after verification): C:\Users\lover\zmd-scratch

## Status: COMPLETE (2026-11-11)
- deliverables/video/zoumadeng_demo_1080p60.mp4 (+ _compact), deliverables/report/zoumadeng_project-report.pdf,
  deliverables/zoumadeng_demo-web.zip, deliverables/zoumadeng_source-code.zip, deliverables/print/ (STL, 3MF),
  deliverables/SUBMISSION.md (title, intro, field map).
- Verified: video probed 1920x1080 / 60 fps / 78 s; PDF pages inspected; demo runs from the share and from the
  extracted zip; 22 posed STLs + Lux3D STL are edge-manifold; no API key in the share; shared copies hash-match
  the local scratch copies, and the scratch folder (zmd-scratch under the user profile) was then removed.

## Not done (needs the user)
- Public Demo link (ModelScope Studio), competition form submission, Xiaohongshu post.
- Rules page could not be fetched; upload limits for video/report unverified.
- No physical print; video has no audio; real-display frame rate not measured.

## Do not start
- No second concept, extra characters or new features. Only fix defects the user reports.

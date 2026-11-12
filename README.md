# 走马灯 · Zoetrope of Frozen Motion

## 完整项目备份与下载

[打开最终交付 Release](https://github.com/Changhongyin/Zoetrope-of-Frozen-Motion/releases/tag/v1.0.0)

- **Zoetrope-Full-Project.zip**：完整项目备份，含全部有效工程文件、原始 Lux3D 产物、参考资料、网页、过程图、报告、视频及打印文件。恢复本地工程请下载这个附件。
- **Zoetrope-Source-Code.zip**：原始参赛源码包。
- **Zoetrope-Demo-1080p60.mp4**：78秒演示视频。
- **Zoetrope-Project-Report.pdf**：项目报告。
- **Backup-Manifest.json / SHA256SUMS.txt**：工程文件与发布附件的校验清单。

Git 仓库存放可编辑源码和资产；ZIP 与视频放在关联 Release。GitHub 自动生成的 Source code.zip 不包含这些大附件。完整备份中的相对目录结构与原项目保持一致；仅排除 Finder 元数据及 Python 字节码缓存。



A hand-spun 3D zoetrope in the browser. Aholo Lux3D generates a character, rigs it and gives it looping
motions; the page freezes each motion into a ring of static sculptures. Under steady light the spinning ring
is a blur. Open the shutter and the frozen statues come alive. Every statue can be downloaded as an STL.

Entry for the Manycore Aholo Global 3D AI Hackathon. Independent of any other project in this share.

## Run the demo

Requirements: Python 3.8+ (only for the static file server) and a WebGL2 browser. No build step, no install.

```
cd source/web
python serve.py 8765
```

Open http://localhost:8765/

| Input | Effect |
| --- | --- |
| Drag left / right | Spin the wheel (inertia; the candle motor eases it back to cruising speed) |
| Space (tap = toggle, hold = momentary) or the 烛光 / 快门 switch | Steady light <-> synced shutter |
| 错拍 slider | Detune the shutter in Hz; double-click to reset |
| Click a statue | Lift that single frame off the wheel; drag to turn it; download STL |
| Left column | Switch between the 8 Lux3D motions |
| Shift-drag / right-drag, mouse wheel | Orbit, zoom |
| `?director` | Play the scripted showreel live |
| `?q=low` / `?q=high` | Force quality (default adapts to the frame rate) |

Any static host works (the folder `source/web` is self-contained, about 34 MB). `deliverables/zoumadeng_demo-web.zip`
is the same folder, ready to upload to a static space such as ModelScope Studio.

Note for VMware / blocklisted GPUs: start Edge or Chrome with `--ignore-gpu-blocklist`, otherwise WebGL falls
back to slow software rendering.

## What Lux3D contributed (all task IDs are in `assets/lux3d/ledger.jsonl`)

| Step | Lux3D capability | Task | Credits |
| --- | --- | --- | --- |
| Character concept image | multimodal-to-image | 6656052 | 12 |
| Character mesh + PBR textures (43,894 tris) | img-to-3d, G1 | 6656685 | 20 |
| 52-bone humanoid skeleton + skin weights | humanoid auto-rig | 6659006 | 15 |
| 8 looping motions on that skeleton | animation retarget | 6659806 | 6 |
| Lantern concept image | multimodal-to-image | 6661057 | 12 |
| Lantern mesh + textures (54,094 tris) | img-to-3d, G1 | 6661658 | 20 |
| Watertight print files of the character (STL, 3MF) | multi-format export | 6663902 | 1 |

Total: 86 credits, 7 tasks, no failed or repeated generations. Credits are the `consumedCredits` values
returned by the Lux3D task list API.

Not made by Lux3D (drawn by code in `source/web/main.js`): the turntable, its painted pattern, the pole, the
lights, the blur/shutter simulation and the UI. The posed statues are the Lux3D mesh deformed by the Lux3D
skeleton and Lux3D motion, sampled at N phases by our code.

## Folders

- `source/web/` the demo (three.js r180 vendored in `vendor/`), `director.js` is the showreel script
- `source/lux3d/` the REST client and the resumable generation scripts (`chain_character.py`, `img3d_from_task.py`, `export_print.py`)
- `source/capture/` headless recording (`capture.mjs`), screenshots (`shot.mjs`), STL export (`export_stl.mjs`)
- `source/report/` report source (HTML) and its build script
- `assets/lux3d/` every raw Lux3D output plus the ledger
- `review/` a few evidence images from development
- `deliverables/` video, PDF report, demo zip, print files, submission text
- `references/` competition inputs and the Aholo OpenAPI spec used

## Reproduce

Generation (needs `LUX3D_CN_API_KEY` in the environment; the key is never written to disk):

```
python source/lux3d/lux3d.py create image @source/lux3d/req_kid_image.json kid_concept
python source/lux3d/chain_character.py kid <image_task_id> 50000
python source/lux3d/img3d_from_task.py lantern <lantern_image_task_id> 60000
python source/lux3d/export_print.py kid <img3d_task_id>
```

Recording and print files (needs Node 18+, `npm i puppeteer-core` next to the scripts, Edge, ffmpeg, and the
demo server running):

```
set FFMPEG=<path to ffmpeg>
node capture.mjs zoumadeng_1080p60.mp4 1920x1080 60 78
node export_stl.mjs ../../deliverables/print Jog_Fwd_Loop
```

The recording steps the live page with a fixed 1/60 s time step and screenshots every frame, so the video is
real output of the running demo at native 1920x1080, 60 fps. It is not upscaled or interpolated.

## Versions

three.js 0.180.0 (MIT, vendored), Python 3.12, Node 24, Edge (Chromium) headless for capture, ffmpeg 9.0.1
(imageio-ffmpeg build), puppeteer-core. Lux3D model version G1 via https://api.aholo3d.cn.

## Credits and licences

- Character, lantern, skeleton, motions, print files: generated with Aholo Lux3D from our own text prompts.
- three.js: MIT licence (`source/web/vendor/THREE-LICENSE`).
- Fonts: system fonts only. No third-party images, models, music or footage.

## Honest limitations

- The shutter is a perceptual simulation (sample-and-hold of the wheel angle at flash instants), not a
  physically flickering light. This avoids real flashing on screen.
- No physical print has been made. The Lux3D STL of the rest pose is verified watertight; posed STLs are
  checked the same way (see report), but real printing may still need supports.
- The public demo does not call Lux3D live (an API key cannot ship in client code); it replays assets that
  were generated through the API.
- The video has no soundtrack.

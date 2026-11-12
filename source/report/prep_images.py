"""Collects the report images (real screenshots and frames of the final video) into source/report/img/.
  python prep_images.py <scratch_tools_dir> <final_video.mp4> <ffmpeg.exe>"""
import os, subprocess, sys
from PIL import Image

tools, video, ff = sys.argv[1:4]
root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
out = os.path.join(root, "source", "report", "img")
os.makedirs(out, exist_ok=True)


def save(im, name, w=1600, crop=None):
    im = im.convert("RGB")
    if crop:
        im = im.crop(crop)
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(os.path.join(out, name), quality=88)


def shot(rel, name, **k):
    save(Image.open(os.path.join(tools, rel)), name, **k)


def frame(t, name, **k):
    tmp = os.path.join(out, "_tmp.png")
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", str(t), "-i", video, "-frames:v", "1", tmp], check=True)
    save(Image.open(tmp), name, **k)
    os.remove(tmp)


# development screenshots (iterations)
shot("t1/strobe.png", "it_a1.jpg", w=900, crop=(380, 180, 1540, 980))
shot("t5/b_strobe.png", "it_a2.jpg", w=900, crop=(380, 180, 1540, 980))
shot("t2/f_swim.png", "it_b1.jpg", w=900, crop=(380, 280, 1540, 1080))
shot("t2/d_inspect.png", "it_c1.jpg", w=900, crop=(380, 140, 1540, 940))
shot("t7/i1.png", "it_c2.jpg", w=900, crop=(380, 140, 1540, 940))
shot("t7/i1.png", "print.jpg", w=1400)
shot("t7/i2.png", "mesh.jpg", w=900, crop=(480, 160, 1180, 860))
shot("t5/c_close.png", "poses.jpg", w=900, crop=(360, 380, 1300, 1000))
shot("t2/sheet_clips.jpg", "clips.jpg", w=900)
shot("t5/a_candle.png", "hero_candle.jpg", w=1200, crop=(0, 0, 960, 1080))
shot("t5/b_strobe.png", "hero_shutter.jpg", w=1200, crop=(960, 0, 1920, 1080))
for src, dst in (("kid_concept_t6656052_0.jpg", "kid_concept.jpg"), ("lantern_concept_t6661057_0.jpg", "lantern_concept.jpg")):
    save(Image.open(os.path.join(root, "assets", "lux3d", "concept", src)), dst, w=700)
# frames of the delivered video
frame(61, "it_b2.jpg", w=900, crop=(380, 180, 1540, 980))
frame(14.5, "f_signature.jpg")
frame(6, "f_candle.jpg")
frame(30, "f_detune.jpg")
for i, t in enumerate((5, 14, 36.5, 50, 61, 69.5), 1):
    frame(t, "v%d.jpg" % i, w=1100)
print(sorted(os.listdir(out)))

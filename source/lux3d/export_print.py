"""Lux3D multi-format export of the character's generation ZIP to print formats (STL + 3MF). Resumable.
  python export_print.py <label> <img3d_taskid>"""
import json, os, sys
import lux3d

label, src = sys.argv[1], sys.argv[2]
out = os.path.join(lux3d.ROOT, "assets", "lux3d", label)
sp = os.path.join(out, "export_state.json")
st = json.load(open(sp, encoding="utf-8")) if os.path.exists(sp) else {}
if "export" not in st:
    urls = [o["content"] for o in lux3d.get(src)["d"]["outputs"] if o and o.get("content", "").startswith("http")]
    zip_url = [u for u in urls if u.split("?")[0].lower().endswith(".zip")][0]
    res = lux3d.create("export", {"modelUrl": zip_url, "outputFormat": ["stl", "3mf"]}, label + "_export")
    if res.get("c") != "0":
        sys.exit(json.dumps(res, ensure_ascii=False))
    st["export"] = res["d"]
    json.dump(st, open(sp, "w", encoding="utf-8"), indent=1)
    print("task", st["export"], flush=True)
r = lux3d.wait(st["export"], 1800)
print(json.dumps(r, ensure_ascii=False)[:1500])
if r["d"]["status"] == 3 and "files" not in st:
    st["files"] = lux3d.fetch(st["export"], os.path.join(out, "print"), label + "_export")
    json.dump(st, open(sp, "w", encoding="utf-8"), indent=1)
print("DONE", json.dumps(st))

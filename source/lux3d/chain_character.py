"""Resumable Lux3D chain for one character: concept image -> img-to-3D -> rig -> retarget.

  python chain_character.py <label> <concept_image_taskid> [faceCount]

State is kept in assets/lux3d/<label>/chain_state.json; a step with a recorded task ID is
never re-submitted, it is only polled / re-downloaded.
"""
import json, os, sys
import lux3d

label = sys.argv[1]
concept_task = sys.argv[2]
face_count = int(sys.argv[3]) if len(sys.argv) > 3 else 50000
ANIMS = ["Jog_Fwd_Loop", "Sprint_Loop", "Walk_Loop", "Dance_Loop", "Walk_Carry_Loop",
         "Idle_Lantern_Loop", "Swim_Fwd_Loop", "Zombie_Walk_Fwd_Loop"]

out = os.path.join(lux3d.ROOT, "assets", "lux3d", label)
os.makedirs(out, exist_ok=True)
sp = os.path.join(out, "chain_state.json")
st = json.load(open(sp, encoding="utf-8")) if os.path.exists(sp) else {}


def save():
    with open(sp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(st, f, indent=1, ensure_ascii=False)


def outputs(taskid):
    d = lux3d.get(taskid).get("d") or {}
    return d.get("status"), [o.get("content") for o in (d.get("outputs") or [])]


def step(name, alias, body_fn):
    if name not in st:
        res = lux3d.create(alias, body_fn(), "%s_%s" % (label, name))
        if res.get("c") != "0" or not res.get("d"):
            sys.exit("create %s failed: %s" % (name, json.dumps(res, ensure_ascii=False)))
        st[name] = res["d"]
        save()
        print(name, "task", st[name], flush=True)
    res = lux3d.wait(st[name], 2400)
    status = (res.get("d") or {}).get("status")
    if status != 3:
        sys.exit("%s ended with status %s: %s" % (name, status, json.dumps(res, ensure_ascii=False)[:800]))
    if name + "_files" not in st:
        st[name + "_files"] = lux3d.fetch(st[name], out, "%s_%s" % (label, name))
        save()
    return outputs(st[name])[1]


def first_url(contents, ext):
    for c in contents:
        if c and c.startswith("http") and c.split("?")[0].lower().endswith(ext):
            return c
    sys.exit("no %s url in %s" % (ext, contents))


img_url = first_url(outputs(concept_task)[1], "")
glb = first_url(step("img3d", "img3d", lambda: {"img": img_url, "version": "G1", "faceCount": face_count,
                                                "outputFormat": ["zip", "glb"]}), ".glb")
rig = first_url(step("rig", "rig", lambda: {"modelUrl": glb}), ".glb")
step("retarget", "retarget", lambda: {"rigModelUrl": rig, "animationIds": ANIMS,
                                      "animationOutputMode": "combined", "outFormat": "glb",
                                      "animateInPlace": True})
print("CHAIN DONE", json.dumps(st, ensure_ascii=False))

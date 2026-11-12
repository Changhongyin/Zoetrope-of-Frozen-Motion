// Scripted showreel used by ?director (live) and ?capture (frame-stepped recording).
// It only drives the same state the mouse/keyboard drive; nothing here is pre-rendered.
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

export const DURATION = 78;

export function install(z) {
  const { S, CAM } = z;
  const clip = (name) => z.clips.find((c) => c.name === name);
  const ui = (clean) => document.body.classList.toggle('clean', clean);
  const motor = () => z.motorOmega();
  ui(true);
  S.omega = motor(); CAM.zoom = CAM.tzoom = 1.12; CAM.yaw = CAM.tyaw = -0.25;

  const shots = [
    // 1. steady light: a blur
    { t: 0, until: 3, do() { }, during(u) { S.fade = ease(u); } },
    { t: 0, until: 9.5, during(u) { CAM.tzoom = lerp(1.12, 0.86, ease(u)); CAM.tyaw = lerp(-0.25, 0, ease(u)); } },
    { t: 2.2, do() { z.caption('灯一点，转盘就停不下来', 'Steady candlelight: twenty-odd statues spin into a blur.'); } },
    { t: 7.6, do() { z.caption('按下快门', 'Open the shutter.'); } },
    // 2. signature moment
    { t: 9.5, do() { z.setStrobe(true); z.caption(''); } },
    { t: 11.2, do() { z.caption('雕塑没有动。是光，让他跑了起来', 'Nothing here moves except the wheel. The light does the animating.'); } },
    { t: 11, until: 17, during(u) { CAM.tzoom = lerp(0.86, 0.62, ease(u)); CAM.tpitch = lerp(0, -0.06, ease(u)); } },
    { t: 17.2, do() { z.setStrobe(false); z.caption(''); } },
    { t: 18.6, do() { z.setStrobe(true); } },
    { t: 19.6, do() { z.setStrobe(false); } },
    { t: 20.8, do() { z.setStrobe(true); ui(false); z.caption('烛光 ⇄ 快门，一键切换', 'Space toggles between candle and shutter.'); } },
    { t: 21, until: 25, during(u) { CAM.tzoom = lerp(0.62, 0.9, ease(u)); CAM.tpitch = lerp(-0.06, 0.05, ease(u)); } },
    // 3. detune
    { t: 25.5, do() { z.caption('让快门慢半拍，他们开始绕着灯走', 'Detune the shutter and the runners drift around the lantern.'); } },
    { t: 26, until: 29, during(u) { setDetune(lerp(0, -2.2, ease(u))); } },
    { t: 29, until: 32, during(u) { setDetune(lerp(-2.2, 2.2, ease(u))); } },
    { t: 32, until: 33.5, during(u) { setDetune(lerp(2.2, 0, ease(u))); } },
    // 4. the hand is the playhead
    { t: 34, do() { setDetune(0); z.caption('转多快，他就跑多快', 'Your hand is the playhead: spin faster and he sprints.'); } },
    { t: 34.5, until: 36, during(u) { S.dragging = true; S.omega = lerp(motor(), motor() * 2.3, ease(u)); S.theta += S.omega / 60; } },
    { t: 36, do() { S.dragging = false; } },
    { t: 38.6, do() { z.caption('倒着转，时间倒流', 'Spin it backwards and time runs in reverse.'); } },
    { t: 39, until: 41.5, during(u) { S.dragging = true; S.omega = lerp(motor() * 1.5, -motor() * 1.1, ease(u)); S.theta += S.omega / 60; } },
    { t: 41.5, do() { S.dragging = false; S.dir = -1; } },
    { t: 44.5, until: 46, during(u) { S.dragging = true; S.omega = lerp(-motor(), motor(), ease(u)); S.theta += S.omega / 60; } },
    { t: 46, do() { S.dragging = false; S.dir = 1; z.caption(''); } },
    // 5. a frame is a sculpture
    { t: 46.6, do() { z.openInspect(pickFront()); z.caption('每一帧，都是一尊可以 3D 打印的雕塑', 'Every frame is a static sculpture, exportable as STL.'); } },
    { t: 53.4, do() { z.closeInspect(); z.caption(''); } },
    // 6. other motions
    { t: 54.6, do() { swap('Dance_Loop', '舞'); } },
    { t: 59.0, do() { swap('Swim_Fwd_Loop', '游'); } },
    { t: 63.2, do() { swap('Zombie_Walk_Fwd_Loop', '梦游'); } },
    // 7. backstage + ending
    { t: 67.4, do() { z.caption('角色、骨骼、动作，全部由 Aholo Lux3D 生成', 'Character, skeleton and motion: all generated with Aholo Lux3D.'); document.getElementById('backstage').hidden = false; } },
    { t: 72.6, do() { document.getElementById('backstage').hidden = true; z.caption(''); z.setStrobe(false); ui(true); document.getElementById('title').style.opacity = 1; } },
    { t: 72.6, until: 78, during(u) { CAM.tzoom = lerp(0.9, 1.15, ease(u)); S.fade = 1 - ease(Math.max(0, (u - 0.6) / 0.4)); } },
  ];
  function setDetune(v) { S.detune = v; const el = document.getElementById('detune'); el.value = v; }
  function pickFront() {
    // the statue currently nearest the camera side of the wheel
    let best = 0, bd = 1e9; const th = S.theta;
    z.statues.forEach((s, i) => { const a = Math.atan2(Math.sin(s.angle + th), Math.cos(s.angle + th)); if (Math.abs(a) < bd) { bd = Math.abs(a); best = i; } });
    return best;
  }
  async function swap(name, label) {
    const c = clip(name); if (!c) return;
    await z.buildRing(c); S.omega = motor();
    z.caption(label, c.name.replace(/_/g, ' ') + ' · Lux3D animation retarget');
  }
  z.setShots(shots);
}

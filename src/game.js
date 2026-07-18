// 約拿落海(拿1)3D —— 單一 class(場景+狀態機+風暴+動畫),不碰 DOM(照 3d-game-kit 三件套)
// 底座=waterpolo3d(水地基);water-kit 首個聖經皮:調 WATER.waves 振幅=泳池→風暴海。
// ⛪ 神學鐵則:海的平靜是神蹟(拿1:15),固定觸發、不因玩家手感好壞而異;
//   張力放在「撐船耐力」(舀水/穩舵);大魚是神的安排與憐憫(拿1:17),非玩家掙來的。
import * as THREE from "three";
import {
  WATER, SWIM, waterHeightAt, waterSlopeAt, createWaterSurface, applyBuoyancy, applySwimMotion,
  SplashSystem,
} from "./water.js";

export const DIFFICULTY_LABELS = {
  kids: "幼兒", child: "兒童", easy: "入門", normal: "標準", hard: "職業",
};

// 五檔難度(量值鐵則:數字集中這裡,寧可偏簡單、永不會輸)
// stormSeconds=風暴要撐多久;floodRate=進水速度;bailPower=舀水效率;wavePeak=風暴浪高倍率
export const DIFFICULTY_PRESETS = {
  kids:   { stormSeconds: 18, floodRate: 0.05, bailPower: 0.62, wavePeak: 3.0 },
  child:  { stormSeconds: 24, floodRate: 0.07, bailPower: 0.55, wavePeak: 3.5 },
  easy:   { stormSeconds: 30, floodRate: 0.10, bailPower: 0.50, wavePeak: 4.0 },
  normal: { stormSeconds: 38, floodRate: 0.13, bailPower: 0.44, wavePeak: 4.4 },
  hard:   { stormSeconds: 46, floodRate: 0.16, bailPower: 0.40, wavePeak: 4.8 },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const randSigned = (a) => rand(-a, a);

// 場景尺度(公尺):一片開闊海,船在中央
const SEA = { WIDTH: 60, LENGTH: 60 };
const BOAT = { LEN: 7.2, WID: 2.8, DECK_Y: 0.55 };

export class JonahGame {
  constructor({ canvas }) {
    this.canvas = canvas;
    this.difficulty = "easy";

    // 狀態機:menu → intro → storm → lots → confess → overboard → water → fish → done
    this.phase = "menu";
    this.message = "選擇難度後開始。";
    this.time = 0;
    this.hudTimer = 0;
    this.cameraView = 0;
    this.cameraShake = 0;

    this.onHud = null;
    this.onEvent = null;

    // 操作旗標(main.js 設定)
    this.controls = { left: false, right: false, bailHeld: false };

    // 風暴/進水/平衡
    this.waveScale = 1.1;        // 現在的浪高倍率(套到 WATER.waves)
    this.waveScaleTarget = 1.1;  // 目標(各階段設定,每幀 lerp)
    this.stormT = 0;             // 風暴已撐秒數
    this.stormLevel = 0;         // 0..1 風暴強度(驅動浪高/雨/雷/搖晃)
    this.flood = 0;              // 0..1 船艙進水
    this.trim = 0;               // -1..1 玩家穩舵配重(左右)
    this.list = 0;               // 目前船身側傾(視覺+進水)
    this.phaseT = 0;             // 當前階段計時
    this.actionPrompt = null;    // 需要玩家按鍵的提示(如「拋約拿下海」)
    this.rainOn = false;
    this.flash = 0;              // 閃電亮度 0..1
    this.thunderTimer = rand(2, 4);
    this.nearCapsizeCd = 0;

    // ── Three 場景 ──
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.skyCalm = new THREE.Color(0x244a6b);
    this.skyStorm = new THREE.Color(0x0a1420);
    this.scene.background = this.skyStorm.clone();
    this.scene.fog = new THREE.Fog(0x0a1420, 26, 62);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 260);
    this._camPos = new THREE.Vector3(0, 8, 15);
    this._camLook = new THREE.Vector3(0, 1, 0);
    this.camera.position.copy(this._camPos);

    this.hemi = new THREE.HemisphereLight(0x9fbfe0, 0x0a1a2a, 0.75);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xdfeaff, 0.9);
    this.sun.position.set(-10, 20, 8);
    this.scene.add(this.sun);
    this.bolt = new THREE.PointLight(0xdff0ff, 0, 120); // 閃電補光
    this.bolt.position.set(6, 22, -4);
    this.scene.add(this.bolt);

    // 捕捉 water.js 波浪基準振幅(收割慣例:調 WATER.waves 振幅=天氣;不改 water.js 本體)
    this._baseAx = WATER.waves.map((w) => w.ax);

    this.buildSea();
    this.buildBoat();
    this.buildRain();
    this.buildFish();
    this.splash = new SplashSystem(this.scene);

    // 人物:約拿 + 三位水手,站在甲板上(parent 到 boat,隨船搖)
    this.jonah = this.makeFigure({ robe: 0x2f6f7a, cloth: 0xcbb890, beard: 0x3a2a1c, name: "jonah" });
    this.jonah.group.position.set(0.2, BOAT.DECK_Y, 0.2);
    this.boat.add(this.jonah.group);
    this.jonahInWater = false;
    this.jonahPos = new THREE.Vector3();   // 落海後的世界座標
    this.jonahVel = new THREE.Vector3();
    this.jonahSink = SWIM.sink;

    this.sailors = [];
    const sailorDefs = [
      { robe: 0x8a5a3c, cloth: 0xb64f3a, x: -1.9, z: -0.5 },
      { robe: 0x6a7b8c, cloth: 0x3f5566, x: 1.9,  z: -0.4 },
      { robe: 0x7a6a4a, cloth: 0xd8c27a, x: -0.2, z: -1.0 },
    ];
    for (const d of sailorDefs) {
      const f = this.makeFigure({ robe: d.robe, cloth: d.cloth, beard: 0x2a1f16, name: "sailor" });
      f.group.position.set(d.x, BOAT.DECK_Y, d.z);
      f.group.rotation.y = Math.atan2(-d.x, 1.2);
      this.boat.add(f.group);
      this.sailors.push(f);
    }

    this.clock = new THREE.Clock();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.startLoop();
  }

  emitEvent(type, payload = {}) { if (this.onEvent) this.onEvent({ type, ...payload }); }
  get preset() { return DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.easy; }

  // ── 場景建構 ──
  buildSea() {
    this.water = createWaterSurface({
      width: SEA.WIDTH, length: SEA.LENGTH, segX: 96, segZ: 96, color: WATER.colorDeep,
    });
    this.scene.add(this.water.mesh);
    // 深色海底霧板(給海一個底,避免透出背景)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(SEA.WIDTH + 20, SEA.LENGTH + 20),
      new THREE.MeshStandardMaterial({ color: 0x07131f, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -6;
    this.scene.add(floor);
  }

  buildBoat() {
    const boat = new THREE.Group();
    boat.rotation.order = "ZXY";
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x4d341e, roughness: 0.95 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x8a6540, roughness: 1 });

    // 船身:中段箱體 + 前後上翹(古船)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(BOAT.LEN, 1.1, BOAT.WID), wood);
    hull.position.y = 0.1;
    boat.add(hull);
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, BOAT.WID * 0.82), woodDark);
      cap.position.set(end * (BOAT.LEN / 2 - 0.2), 0.45, 0);
      cap.rotation.z = end * -0.5; // 船首尾上翹
      boat.add(cap);
    }
    // 甲板
    const deck = new THREE.Mesh(new THREE.BoxGeometry(BOAT.LEN - 0.4, 0.16, BOAT.WID - 0.5), deckMat);
    deck.position.y = BOAT.DECK_Y - 0.08;
    boat.add(deck);
    // 船舷欄
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(BOAT.LEN - 0.6, 0.5, 0.18), woodDark);
      rail.position.set(0, BOAT.DECK_Y + 0.2, side * (BOAT.WID / 2 - 0.2));
      boat.add(rail);
    }
    // 桅杆 + 破帆(風暴中鼓動)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 5, 10), woodDark);
    mast.position.set(-0.3, BOAT.DECK_Y + 2.4, 0);
    boat.add(mast);
    this.sail = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.8, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cf, roughness: 0.85, side: THREE.DoubleSide }),
    );
    this.sail.position.set(-0.3, BOAT.DECK_Y + 2.6, 0.02);
    this._sailBaseX = new Float32Array(this.sail.geometry.attributes.position.count);
    for (let i = 0; i < this._sailBaseX.length; i++) this._sailBaseX[i] = this.sail.geometry.attributes.position.getX(i);
    boat.add(this.sail);

    // 甲板積水面(進水視覺:一片半透明水漲上來)
    this.deckWater = new THREE.Mesh(
      new THREE.PlaneGeometry(BOAT.LEN - 0.6, BOAT.WID - 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2f6f8f, transparent: true, opacity: 0.7, roughness: 0.3 }),
    );
    this.deckWater.rotation.x = -Math.PI / 2;
    this.deckWater.position.y = BOAT.DECK_Y - 0.02;
    this.deckWater.visible = false;
    boat.add(this.deckWater);

    this.scene.add(boat);
    this.boat = boat;
  }

  buildRain() {
    const N = 900;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    this._rain = { n: N, base: new Float32Array(N * 3), speed: new Float32Array(N) };
    for (let i = 0; i < N; i++) {
      const x = randSigned(28), y = rand(0, 26), z = randSigned(28);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      this._rain.base[i * 3] = x; this._rain.base[i * 3 + 2] = z;
      this._rain.speed[i] = rand(22, 34);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xbcd4e8, size: 0.09, transparent: true, opacity: 0.55 });
    this.rain = new THREE.Points(geo, mat);
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  buildFish() {
    const fish = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x35566b, roughness: 0.65 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x8fb4c4, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 16), skin);
    body.scale.set(2.3, 1.15, 1.15);
    fish.add(body);
    const bellyM = new THREE.Mesh(new THREE.SphereGeometry(2.28, 20, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), belly);
    bellyM.scale.set(2.3, 1.15, 1.15);
    fish.add(bellyM);
    // 尾鰭
    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 4), skin);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -6.2;
    tail.scale.set(1, 1, 0.35);
    fish.add(tail);
    this.fishTail = tail;
    // 背鰭
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.6, 4), skin);
    fin.position.set(0.5, 2.2, 0);
    fish.add(fin);
    // 眼
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      w.position.set(3.6, 0.7, s * 1.0);
      fish.add(w);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), new THREE.MeshBasicMaterial({ color: 0x101018 }));
      p.position.set(3.85, 0.7, s * 1.05);
      fish.add(p);
    }
    // 下顎(開合=吞)
    this.fishJaw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 3.2), new THREE.MeshStandardMaterial({ color: 0x223541, roughness: 0.8 }));
    this.fishJaw.position.set(4.2, -0.7, 0);
    fish.add(this.fishJaw);
    // 口內(深色)
    const maw = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0x2a0f14 }));
    maw.position.set(4.6, 0, 0);
    maw.scale.set(0.8, 0.9, 0.9);
    fish.add(maw);

    fish.visible = false;
    fish.position.set(14, -8, -4);
    this.scene.add(fish);
    this.fish = fish;
  }

  // 古裝人物(★臉部鐵則:白眼珠+瞳孔+眉毛+嘴;長袍+頭巾+鬍;膚色 emissive 背光可見)
  makeFigure({ robe, cloth, beard, name }) {
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const robeMat = new THREE.MeshStandardMaterial({ color: robe, roughness: 0.95 });
    const clothMat = new THREE.MeshStandardMaterial({ color: cloth, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0d3aa, roughness: 0.7, emissive: 0x7a6446, emissiveIntensity: 0.45 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x23190f });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const beardMat = new THREE.MeshStandardMaterial({ color: beard, roughness: 1 });

    // 長袍下襬(下寬上窄的錐台)+ 腰帶
    const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.42, 1.05, 12), robeMat);
    gown.position.y = 0.52;
    g.add(gown);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 12), clothMat);
    belt.position.y = 0.78;
    g.add(belt);
    // 上身
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.26), robeMat);
    torso.position.y = 1.06;
    g.add(torso);
    // 手臂(pivot 在肩;bracing/舀水動畫用)
    const mkArm = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 1.22, 0);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.12), robeMat);
      arm.position.y = -0.2; pivot.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), skin);
      hand.position.y = -0.44; pivot.add(hand);
      g.add(pivot);
      return pivot;
    };
    const armL = mkArm(-0.28), armR = mkArm(0.28);
    // 腳(水中掙扎才明顯)
    const mkLeg = (x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.14, 0);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), skin);
      leg.position.y = -0.2; pivot.add(leg);
      g.add(pivot);
      return pivot;
    };
    const legL = mkLeg(-0.12), legR = mkLeg(0.12);

    // 頭 + 臉
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 16), skin);
    head.position.y = 1.44;
    g.add(head);
    // 頭巾:罩頂半球 + 頭箍
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), clothMat);
    hood.position.y = 1.45;
    g.add(hood);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 20), beardMat);
    band.position.y = 1.5; band.rotation.x = Math.PI / 2;
    g.add(band);
    // 眼/瞳/眉/嘴(面向 +z)
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), white);
    eyeL.position.set(-0.07, 1.47, 0.15); g.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.x = 0.07; g.add(eyeR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 8), dark);
    pupilL.position.set(-0.07, 1.47, 0.185); g.add(pupilL);
    const pupilR = pupilL.clone(); pupilR.position.x = 0.07; g.add(pupilR);
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.016, 0.016), dark);
    browL.position.set(-0.07, 1.53, 0.17); browL.rotation.z = 0.14; g.add(browL);
    const browR = browL.clone(); browR.position.x = 0.07; browR.rotation.z = -0.14; g.add(browR);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 12, Math.PI), dark);
    mouth.position.set(0, 1.38, 0.17); mouth.rotation.z = Math.PI; g.add(mouth);
    // 鬍(嘴下小錐)
    const beardMesh = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 8), beardMat);
    beardMesh.position.set(0, 1.3, 0.12); beardMesh.rotation.x = Math.PI;
    g.add(beardMesh);

    return { group: g, armL, armR, legL, legR, mouth, name };
  }

  // ── 呈現/流程控制 API(main.js 呼叫) ──
  applyPresentation({ difficulty }) {
    if (difficulty && DIFFICULTY_PRESETS[difficulty]) this.difficulty = difficulty;
  }

  start() {
    // 重置到風暴序幕
    this.phase = "intro";
    this.phaseT = 0;
    this.stormT = 0;
    this.stormLevel = 0;
    this.flood = 0;
    this.trim = 0;
    this.list = 0;
    this.waveScale = 1.4;
    this.waveScaleTarget = 3.4;
    this.rainOn = true;
    this.rain.visible = true;
    this.actionPrompt = null;
    this.jonahInWater = false;
    this.jonahSink = SWIM.sink;
    this.jonah.group.visible = true;
    this.jonah.group.scale.setScalar(1);
    this.boat.add(this.jonah.group);
    this.jonah.group.position.set(0.2, BOAT.DECK_Y, 0.2);
    this.jonah.group.rotation.set(0, Math.PI, 0);
    this.fish.visible = false;
    this.deckWater.visible = false;
    this.cameraView = 0;
    this.message = "耶和華使海中起大風(拿1:4)——撐住這條船!";
    this.emitEvent("intro");
    this.pushHud();
  }

  triggerAction() {
    // 玩家按下主鍵/主按鈕:用於劇情推進(認罪後拋約拿下海)
    if (this.phase === "confess" && this.actionPrompt) {
      this.actionPrompt = null;
      this.throwJonah();
    }
  }

  cycleCameraView() {
    this.cameraView = (this.cameraView + 1) % 3;
    const names = ["電影視角", "高空俯瞰", "貼近水面"];
    this.message = `視角:${names[this.cameraView]}`;
    this.pushHud();
  }

  // ── 主迴圈 ──
  startLoop() {
    if (this._raf) return; // 防雙迴圈(3d-game-kit 雷)
    const loop = () => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.time += dt;
      this.update(dt);
      this.renderFrame(dt);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    this.phaseT += dt;
    // 浪高倍率每幀趨近目標,套回 water.js 的波陣列(收割慣例)
    this.waveScale = lerp(this.waveScale, this.waveScaleTarget, 1 - Math.exp(-dt * 1.6));
    for (let i = 0; i < WATER.waves.length; i++) WATER.waves[i].ax = this._baseAx[i] * this.waveScale;

    // 天氣強度 → 背景色/雨/閃電
    const wx = clamp((this.waveScale - 0.3) / 4.2, 0, 1);
    this.stormLevel = wx;
    this.scene.background.copy(this.skyCalm).lerp(this.skyStorm, wx);
    if (this.scene.fog) this.scene.fog.color.copy(this.scene.background);
    this.hemi.intensity = lerp(1.05, 0.6, wx);
    if (this.rain) this.rain.material.opacity = 0.55 * wx;
    this.updateWeather(dt, wx);

    switch (this.phase) {
      case "menu": break;
      case "intro": this.updateIntro(dt); break;
      case "storm": this.updateStorm(dt); break;
      case "lots": this.updateLots(dt); break;
      case "confess": this.updateConfess(dt); break;
      case "overboard": this.updateOverboard(dt); break;
      case "water": this.updateWater(dt); break;
      case "fish": this.updateFish(dt); break;
      case "done": break;
    }
    this.hudTick(dt);
  }

  updateWeather(dt, wx) {
    // 閃電:風暴越強越常打;打時全場亮一下 + 雷聲(交給 main 的事件)
    this.thunderTimer -= dt;
    if (this.thunderTimer <= 0 && wx > 0.35 && this.phase !== "done") {
      this.thunderTimer = rand(2.6, 6.5) * (1.2 - wx);
      this.flash = 1;
      this.cameraShake = Math.max(this.cameraShake, 0.35 * wx);
      this.emitEvent("thunder", { strength: wx });
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    this.bolt.intensity = this.flash * 6;
  }

  updateIntro(dt) {
    this.waveScaleTarget = 3.4;
    if (this.phaseT > 3.4) {
      this.phase = "storm";
      this.phaseT = 0;
      this.message = "舀水!穩住船身,撐過這場風暴!";
      this.emitEvent("storm-start");
      this.pushHud();
    }
  }

  updateStorm(dt) {
    const p = this.preset;
    this.stormT += dt;
    const prog = clamp(this.stormT / p.stormSeconds, 0, 1);
    // 風暴越來越猛(浪高隨進度爬升到 wavePeak)
    this.waveScaleTarget = lerp(3.2, p.wavePeak, prog);

    // 穩舵:左右配重(視覺 + 影響進水)
    const trimInput = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    this.trim = clamp(this.trim + trimInput * dt * 1.6, -1, 1);
    if (!trimInput) this.trim *= Math.max(0, 1 - dt * 1.4);

    // 船身側傾:浪 + 配重;配重抵銷浪 = 平穩
    const waveRoll = Math.sin(this.time * 1.7) * 0.28 * this.stormLevel + waterSlopeAt(0, 0, this.time).dx * 0.5;
    this.list = lerp(this.list, waveRoll - this.trim * 0.34, 1 - Math.exp(-dt * 4));

    // 進水:隨浪高上升;側傾越大灌越快;舀水(按住)往下壓。★永不會輸
    const floodIn = p.floodRate * (0.6 + this.stormLevel) * (1 + Math.abs(this.list) * 1.6);
    const bailOut = this.controls.bailHeld ? p.bailPower : 0;
    this.flood = clamp(this.flood + (floodIn - bailOut) * dt, 0, 1);
    this.deckWater.visible = this.flood > 0.04;
    this.deckWater.material.opacity = 0.4 + 0.4 * this.flood;
    this.deckWater.position.y = BOAT.DECK_Y - 0.14 + this.flood * 0.34;
    if (this.controls.bailHeld && Math.random() < dt * 8) {
      this.splash.spawn(this.boat.position.x + randSigned(1.5), this.boat.position.z + randSigned(0.8), 0.3, this.time);
    }

    // 進水滿:船幾乎破壞(拿1:4)但神保守不沉——大搖晃後回退,永不 game over
    if (this.flood >= 1 && this.nearCapsizeCd <= 0) {
      this.nearCapsizeCd = 3;
      this.flood = 0.66;
      this.cameraShake = 0.7;
      this.message = "船幾乎破壞!快舀水——它還撐得住!";
      this.emitEvent("near-capsize");
    }
    if (this.nearCapsizeCd > 0) this.nearCapsizeCd -= dt;

    if (prog >= 1) {
      this.phase = "lots";
      this.phaseT = 0;
      this.message = "這風暴不尋常……水手說:來掣籤,看這災是因誰!(拿1:7)";
      this.emitEvent("lots");
      this.pushHud();
    }
  }

  updateLots(dt) {
    this.waveScaleTarget = this.preset.wavePeak;
    // 掣籤序列:~3.5s 後籤落在約拿身上 → 認罪
    if (this.phaseT > 3.6) {
      this.phase = "confess";
      this.phaseT = 0;
      this.actionPrompt = "拋約拿下海(照約拿的話)";
      this.message = "掣出約拿來!約拿說:將我拋在海中,海就平靜了(拿1:12)";
      this.emitEvent("confess");
      this.pushHud();
    }
  }

  updateConfess(dt) {
    this.waveScaleTarget = this.preset.wavePeak;
    // 等玩家按鍵(triggerAction)→ throwJonah();此處只維持風暴
  }

  throwJonah() {
    this.phase = "overboard";
    this.phaseT = 0;
    // 約拿脫離船體座標系:換掛到 scene,記世界起點
    const wp = new THREE.Vector3();
    this.jonah.group.getWorldPosition(wp);
    this.scene.add(this.jonah.group);
    this.jonah.group.position.copy(wp);
    this.jonahInWater = false;
    this.jonahPos.copy(wp);
    // 拋物線初速:往船外側 + 向上
    this.jonahVel.set(randSigned(1) + 2.2, 5.2, 3.4);
    this.message = "他們遂將約拿抬起,拋在海中……(拿1:15)";
    this.emitEvent("overboard");
    this.pushHud();
  }

  updateOverboard(dt) {
    // 約拿在空中拋物線;落到浪面 → 大水花 + 海立刻平靜(★神蹟固定觸發)
    if (!this.jonahInWater) {
      this.jonahVel.y -= 13 * dt;
      this.jonahPos.addScaledVector(this.jonahVel, dt);
      this.jonah.group.position.copy(this.jonahPos);
      this.jonah.group.rotation.x += dt * 3.4;
      const waveY = waterHeightAt(this.jonahPos.x, this.jonahPos.z, this.time);
      if (this.jonahPos.y <= waveY && this.jonahVel.y < 0) {
        this.jonahInWater = true;
        this.jonahPos.y = waveY;
        this.jonahVel.set(0, 0, 0);
        this.jonah.group.rotation.set(0, 0, 0);
        this.splash.spawn(this.jonahPos.x, this.jonahPos.z, 1, this.time);
        this.cameraShake = 0.4;
        // ★海的狂浪就平息了(拿1:15)——固定觸發,與玩家表現無關
        this.waveScaleTarget = 0.18;
        this.jonahSink = SWIM.sink;
        this.phase = "water";
        this.phaseT = 0;
        this.rainOn = false;
        this.message = "海的狂浪就平息了……海面忽然如鏡。(拿1:15)";
        this.emitEvent("calm");
        this.pushHud();
      }
    }
  }

  updateWater(dt) {
    this.waveScaleTarget = 0.18;
    if (this.rain) this.rain.visible = this.rain.material.opacity > 0.02;
    // 約拿在平靜的海裡下沉、掙扎(玩家可撥水,但這不是成敗——救援是神的安排)
    const desired = new THREE.Vector3();
    const dir = (this.controls.right ? 1 : 0) - (this.controls.left ? 1 : 0);
    if (dir) desired.set(dir * SWIM.maxSpeed * 0.7, 0, 0);
    applySwimMotion(this.jonahVel, desired, dt);
    this.jonahPos.x += this.jonahVel.x * dt;
    this.jonahPos.z += this.jonahVel.z * dt;
    // 逐漸下沉(掙扎撥水稍微延緩,但終究往下——連逃跑也在神手中)
    const sinkPull = this.controls.bailHeld || dir ? 0.06 : 0.12;
    this.jonahSink = Math.min(1.6, this.jonahSink + sinkPull * dt);
    if (Math.random() < dt * 4) this.splash.spawn(this.jonahPos.x, this.jonahPos.z, 0.25, this.time);

    if (this.phaseT > 5) {
      this.phase = "fish";
      this.phaseT = 0;
      this.fish.visible = true;
      this.fish.position.set(this.jonahPos.x - 16, -9, this.jonahPos.z - 3);
      this.message = "耶和華安排一條大魚……(拿1:17)";
      this.emitEvent("fish");
      this.pushHud();
    }
  }

  updateFish(dt) {
    // 大魚從深處游上來,朝約拿;靠近時張口,約拿滑入口中(溫柔=拯救,非驚悚)
    const surfaceY = waterHeightAt(this.jonahPos.x, this.jonahPos.z, this.time) + 0.15;
    const dock = new THREE.Vector3(this.jonahPos.x - 3.6, surfaceY, this.jonahPos.z);
    this.fish.position.lerp(dock, 1 - Math.exp(-dt * 1.3));
    this.fish.rotation.y = 0; // 魚頭朝 +x(約拿在其 +x 側)
    const dist = this.fish.position.distanceTo(this.jonahPos);
    // 張口(越近開越大)
    const openK = clamp((6 - dist) / 5, 0, 1);
    this.fishJaw.rotation.z = -openK * 0.5;
    this.fishJaw.position.y = -0.7 - openK * 0.5;
    if (dist < 4.6) {
      // 約拿被吞入(往魚口移動 + 縮小淡出)
      const mouthPos = this.fish.position.clone().add(new THREE.Vector3(4.4, 0.2, 0));
      this.jonahPos.lerp(mouthPos, 1 - Math.exp(-dt * 3.5));
      const s = Math.max(0.02, this.jonah.group.scale.x - dt * 1.2);
      this.jonah.group.scale.setScalar(s);
      if (this.phaseT > 3 || s <= 0.06) {
        this.fishJaw.rotation.z = 0;
        this.fishJaw.position.y = -0.7;
        this.finish();
      }
    }
  }

  finish() {
    this.phase = "done";
    this.jonah.group.visible = false;
    this.jonah.group.scale.setScalar(1);
    const title = "神安排了一條大魚 🐋";
    const text = "「耶和華安排一條大魚吞了約拿,他在魚腹中三日三夜。」(拿1:17)\n\n約拿想逃離神,神卻連海浪、船、水手、大魚都在祂手中。逃跑到了盡頭,遇見的不是懲罰,是保守——神的呼召仍然在。你逃得出神的手掌心嗎?";
    this.message = "三日三夜,在魚腹中……神的憐憫追著先知不放。";
    this.emitEvent("finish", { title, text });
    this.pushHud();
  }

  // ── HUD ──
  hudTick(dt) {
    this.hudTimer -= dt;
    if (this.phase === "storm" || this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      this.pushHud();
    }
  }

  pushHud() {
    if (!this.onHud) return;
    this.onHud({
      phase: this.phase,
      message: this.message,
      difficulty: this.difficulty,
      stormLevel: this.stormLevel,
      flood: this.flood,
      trim: this.trim,
      stormProgress: this.phase === "storm" ? clamp(this.stormT / this.preset.stormSeconds, 0, 1)
        : (this.phase === "menu" || this.phase === "intro" ? 0 : 1),
      meterActive: this.phase === "storm",
      actionPrompt: this.actionPrompt,
      cameraView: this.cameraView,
    });
  }

  // ── 呈現 ──
  renderFrame(dt) {
    if (this.water) this.water.update(this.time);
    if (this.splash) this.splash.update(dt, this.time);
    this.updateRain(dt);

    // 船:浮在浪上(大 tiltMul=劇烈搖晃)+ 玩家穩舵配重疊加
    if (this.boat && this.phase !== "menu") {
      const tiltMul = 0.6 + this.stormLevel * 2.2;
      applyBuoyancy(this.boat, 0, 0, this.time, { sink: -0.15, bobAmp: 0.12 + this.stormLevel * 0.2, tiltMul });
      this.boat.rotation.z += this.list;
      // 破帆鼓動
      if (this.sail) {
        const pos = this.sail.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const bx = this._sailBaseX[i];
          pos.setZ(i, Math.sin(bx * 2 + this.time * 6) * (0.12 + this.stormLevel * 0.28));
        }
        pos.needsUpdate = true;
      }
    }

    // 甲板人物動畫(隨階段)
    this.animateCrew(dt);

    // 落海後的約拿(浮力+下沉+掙扎)
    if ((this.phase === "overboard" || this.phase === "water" || this.phase === "fish") && this.jonahInWater && this.jonah.group.visible) {
      applyBuoyancy(this.jonah.group, this.jonahPos.x, this.jonahPos.z, this.time, { sink: this.jonahSink, bobAmp: 0.06 });
      this.jonah.group.position.x = this.jonahPos.x;
      this.jonah.group.position.z = this.jonahPos.z;
      // 掙扎划手
      const flail = Math.sin(this.time * 9);
      this.jonah.armL.rotation.x = -Math.PI * 0.7 + flail * 0.6;
      this.jonah.armR.rotation.x = -Math.PI * 0.7 - flail * 0.6;
      this.jonah.legL.rotation.x = flail * 0.5;
      this.jonah.legR.rotation.x = -flail * 0.5;
    }

    // 魚游動:尾鰭擺
    if (this.fish && this.fish.visible) {
      this.fishTail.rotation.y = Math.sin(this.time * 6) * 0.5;
    }

    this.updateCamera(dt);

    // 閃電白幕:直接把背景抬亮
    if (this.flash > 0.02) {
      this.scene.background.lerp(new THREE.Color(0xb9d6ea), this.flash * 0.7);
    }
    this.renderer.render(this.scene, this.camera);
  }

  animateCrew(dt) {
    const crew = this.sailors;
    const storming = this.phase === "intro" || this.phase === "storm" || this.phase === "lots" || this.phase === "confess";
    for (let i = 0; i < crew.length; i++) {
      const f = crew[i];
      if (storming) {
        // 水手:各人哀求自己的神/舀水(拿1:5)——舉手祈求 + 彎腰舀水交替
        const ph = this.time * 3 + i * 2;
        if (i === 2) { // 一人跪求
          f.armL.rotation.x = -Math.PI * 0.85 + Math.sin(ph) * 0.2;
          f.armR.rotation.x = -Math.PI * 0.85 - Math.sin(ph) * 0.2;
        } else {
          f.armL.rotation.x = -0.5 + Math.sin(ph) * 0.9;
          f.armR.rotation.x = -0.5 - Math.sin(ph) * 0.9;
        }
        f.group.rotation.z = Math.sin(this.time * 2 + i) * 0.06;
      } else {
        f.armL.rotation.x *= 0.9; f.armR.rotation.x *= 0.9;
      }
    }
    // 甲板上的約拿(尚未落海):風暴中站不穩;認罪時攤手
    if (!this.jonahInWater && this.jonah.group.visible && this.boat.children.includes(this.jonah.group)) {
      if (this.phase === "confess") {
        this.jonah.armL.rotation.x = -0.9; this.jonah.armR.rotation.x = -0.9;
      } else {
        this.jonah.armL.rotation.x = Math.sin(this.time * 2.4) * 0.4 - 0.2;
        this.jonah.armR.rotation.x = -Math.sin(this.time * 2.4) * 0.4 - 0.2;
      }
    }
  }

  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 2.4);
    let focus, offset;
    const waterPhase = this.phase === "water" || this.phase === "fish" || (this.phase === "overboard" && this.jonahInWater);
    if (waterPhase) {
      focus = new THREE.Vector3(this.jonahPos.x, 0.2, this.jonahPos.z);
      offset = [
        new THREE.Vector3(6, 4.5, 9),
        new THREE.Vector3(0, 16, 0.1),
        new THREE.Vector3(4, 1.6, 7),
      ][this.cameraView];
      if (this.phase === "fish") offset = new THREE.Vector3(9, 5, 11);
    } else {
      focus = new THREE.Vector3(this.boat.position.x, this.boat.position.y + 1.2, this.boat.position.z);
      offset = [
        new THREE.Vector3(0, 5.5, 13),
        new THREE.Vector3(0, 18, 5),
        new THREE.Vector3(7, 2.6, 9),
      ][this.cameraView];
    }
    this._camLook.lerp(focus, k);
    this._camPos.lerp(focus.clone().add(offset), k);
    if (this.cameraShake > 0) this.cameraShake = Math.max(0, this.cameraShake - dt * 0.9);
    const sh = this.cameraShake;
    this.camera.position.set(
      this._camPos.x + randSigned(sh) * 0.5,
      this._camPos.y + randSigned(sh) * 0.35,
      this._camPos.z + randSigned(sh) * 0.5,
    );
    this.camera.lookAt(this._camLook);
  }

  updateRain(dt) {
    if (!this.rain || !this.rain.visible) return;
    const r = this._rain;
    const pos = this.rain.geometry.attributes.position;
    const cx = this._camLook.x, cz = this._camLook.z;
    for (let i = 0; i < r.n; i++) {
      let y = pos.getY(i) - r.speed[i] * dt;
      if (y < 0) { y = rand(18, 26); }
      pos.setY(i, y);
      pos.setX(i, r.base[i * 3] + cx);
      pos.setZ(i, r.base[i * 3 + 2] + cz);
    }
    pos.needsUpdate = true;
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

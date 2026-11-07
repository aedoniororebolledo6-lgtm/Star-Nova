/* Star Nova — núcleo del juego: ciclo, reglas, director de enemigos y misiones. */
import * as THREE from 'three';
import { Physics, G, groups } from './physics.js';
import { buildWorld } from './world/layout.js';
import { REGIONS, regionAt } from './world/palette.js';
import { Sky } from './sky.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { OrbitCam } from './camera.js';
import { Player } from './entities/player.js';
import { Enemy, Guardian, shatter } from './entities/enemies.js';
import { Acorn, StarFall, Pickup } from './combat.js';
import { Bell, Crystal, Crate, PlankBridge, Firefly, Chest, Gate, Lantern, Campfire, Owl, NovaStar } from './props.js';
import { ITEMS, rollItem, computeStats } from './items.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';

const STEP = 1 / 60;
const $ = (id) => document.getElementById(id);

const OWL_LINES = [
  '¡Pip! Qué bueno que despertaste. Soy la Abuela Lechuza, guardiana del Claro.',
  'Anoche la estrella Nova cayó del cielo y se partió. Sus fragmentos se esconden entre las islas.',
  'Al oeste, en el Jardín de Coral, tres campanas esperan que alguien las haga sonar.',
  'Al norte, en las Torres de Menta, se perdieron tres luciérnagas… y las sombras andan inquietas.',
  'Al este, el Puente de Lavanda duerme. Dicen que dos cristales saben despertarlo.',
  'Con tres fragmentos, el portón del Santuario de Nova, al sur, se abrirá. Cuidado: el Guardián vigila.',
  'Las sombras se vuelven más fuertes con el tiempo. Junta chispas, abre cofres y hazte fuerte. ¡Buen viaje!',
];

class Skills {
  constructor(game) {
    this.game = game;
    this.cd = { primary: 0, secondary: 0, utility: 0, special: 0 };
    this.max = { primary: 0.3, secondary: 2.6, utility: 3.2, special: 10 };
  }
  dur(id) { return id === 'primary' ? this.max.primary / this.game.stats.atk : this.max[id]; }
  ready(id) { return this.cd[id] <= 0; }
  use(id) { this.cd[id] = this.dur(id); }
  update(dt) { for (const k in this.cd) this.cd[k] = Math.max(0, this.cd[k] - dt); }
  fraction(id) { return Math.min(1, this.cd[id] / this.dur(id)); }
  left(id) { return this.cd[id]; }
}

export class Game {
  constructor(canvas, params) {
    this.canvas = canvas;
    this.params = params;
    this.mobile = matchMedia('(pointer: coarse)').matches;
    this.v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  }

  init() {
    const canvas = this.canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: 'high-performance', preserveDrawingBuffer: !!this.params.get('ojos') });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#fbe1cf', 30, 165);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 2500);
    this.hemi = new THREE.HemisphereLight('#fff4ec', '#d9a7bd', 1.05);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1df', 2.1);
    sun.castShadow = true;
    const sm = this.mobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sunOffset = new THREE.Vector3(-28, 46, 20);

    this.phys = new Physics();
    this.fx = new FX(scene);
    this.sky = new Sky(scene);
    this.input = new Input(canvas);
    this.cam = new OrbitCam(this.camera, this.phys);
    this.spots = buildWorld(this);

    this.items = {};
    this.level = 1;
    this.xp = 0;
    this.sparks = 0;
    this.time = 0;
    this.stats = computeStats(this.level, this.items);
    this.hp = this.stats.maxHp;
    this.skills = new Skills(this);
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.debris = [];
    this.kills = 0;
    this.director = { credits: 4, t: 0 };
    this.cometT = 3;
    this.aimHold = 0;
    this.region = null;
    this.state = 'title';
    this.god = this.params.get('dios') === '1';

    this.hud = new HUD(this);
    this.missions = new Missions(this);
    this.player = new Player(this, this.spots.spawn);
    const S = this.spots;
    this.props = {
      bells: S.bells.map((s, i) => new Bell(this, s, i)),
      crystals: S.crystals.map((s, i) => new Crystal(this, s, i)),
      fireflies: S.fireflies.map((s, i) => new Firefly(this, s, i)),
      crates: S.crates.map((p) => new Crate(this, p)),
      chests: S.chests.map((s) => new Chest(this, s)),
      lanterns: S.lanterns.map((s) => new Lantern(this, s)),
      bridge: new PlankBridge(this, S.plankBridge),
      gate: new Gate(this, S.gate),
      campfire: new Campfire(this, S.campfire),
      owl: new Owl(this, S.owl),
      nova: new NovaStar(this, S.novaStar),
    };
    this.altarFragment = new Pickup(this, 'fragment', this.v3(...S.altar.pos), 0, { floating: true });
    this.pickups.push(this.altarFragment);
    this.owlLine = 0;
    this.dialogOpen = false;

    this.bindUI();
    this.onResize();
    addEventListener('resize', () => this.onResize());
    this.applyDebug();
    this.hud.refreshMissions();
    this.last = performance.now();
    this.acc = 0;
    this.frames = 0;
    this.titleT = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  /* ---------- atajos de prueba (URL) — ver CLAUDE.md ---------- */
  applyDebug() {
    const P = this.params;
    const places = {
      claro: [0, 0.6, 5], coral: [-46, 0.4, 1], menta: [0, 0.4, -45], lavanda: [44, 0.4, 0], nova: [0, 0.4, 44],
      santuario: [0, 0.4, 54], altar: [82.5, 0.4, 0], puente: [62, 0.4, 0], torre: [8, 11.4, -64], campana: [-55, 0.4, -2],
    };
    if (P.get('t')) this.time = parseFloat(P.get('t')) || 0;
    if (P.get('items')) for (const id of Object.keys(ITEMS)) this.addItem(id, true);
    const nf = parseInt(P.get('frag') || (P.get('jefe') ? '3' : '0'), 10);
    if (nf > 0) {
      this.missions.discoverAll();
      for (const id of ['campanas', 'luciernagas', 'sombras', 'puente'].slice(0, nf)) this.missions.complete(id);
    }
    if (P.get('puente')) for (const c of this.props.crystals) c.activate();
    const go = P.get('jefe') ? 'santuario' : P.get('ir');
    if (go && places[go]) { this.player.teleport(places[go]); this.cam.target.copy(this.player.pos); }
    if (P.get('cam')) { const [y, p, d] = P.get('cam').split(',').map(Number); this.cam.yaw = y || 0; this.cam.pitch = p ?? 0.32; if (d) this.cam.want = this.cam.cur = d; }
    else if (go === 'coral') this.cam.yaw = -Math.PI / 2 * -1;
    else if (go === 'lavanda' || go === 'puente') this.cam.yaw = -Math.PI / 2;
    else if (go === 'nova' || go === 'santuario') this.cam.yaw = Math.PI;
    if (P.get('auto')) this.start();
    if (P.get('enemigos')) {
      const n = parseInt(P.get('enemigos'), 10);
      const types = ['sombra', 'farol', 'totem'];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const p = this.player.pos;
        this.spawnEnemy(types[i % 3], this.v3(p.x + Math.cos(a) * 6, p.y + (i % 3 === 1 ? 2 : 0.3), p.z + Math.sin(a) * 6), true);
      }
    }
    if (P.get('diario')) this.openJournal(true);
    if (P.get('pausa')) this.pause(true);
    if (P.get('final')) setTimeout(() => this.showEnding(), 300);
    if (P.get('hud') === '0') { this.hud.show(false); this.hideHud = true; }
  }

  bindUI() {
    $('btnStart').onclick = () => this.start(true);
    $('btnResume').onclick = () => this.pause(false);
    $('btnRestart').onclick = () => location.reload();
    $('btnJournal').onclick = () => this.openJournal(true);
    $('btnCloseJournal').onclick = () => this.openJournal(false);
    $('btnMute').onclick = () => this.toggleMute();
    $('btnPause').onclick = () => this.pause(true);
    $('btnRespawn').onclick = () => this.respawn();
    $('btnContinue').onclick = () => { $('ending').classList.add('hidden'); this.state = 'play'; this.input.enabled = true; };
    $('dialog').onclick = () => this.advanceDialog();
    $('btnMute').textContent = Audio.muted ? '♪̸' : '♪';
  }

  /* Botón "atrás" de Android: pausa, cierra paneles o sale desde la pantalla de título. */
  backButton() {
    if (this.state === 'play') { this.pause(true); return 'pausa'; }
    if (this.state === 'pause') { this.pause(false); return 'sigue'; }
    if (this.state === 'journal') { this.openJournal(false); return 'cerrar'; }
    if (this.state === 'dialog') { this.advanceDialog(); return 'dialogo'; }
    if (this.state === 'dead' || this.state === 'ending') return 'nada';
    return 'salir';
  }

  toggleMute() { Audio.setMuted(!Audio.muted); $('btnMute').textContent = Audio.muted ? '♪̸' : '♪'; }

  start(fromButton) {
    if (this.state === 'play') return;
    $('title').classList.add('hidden');
    this.state = 'play';
    this.input.enabled = true;
    if (!this.hideHud) this.hud.show(true);
    if (fromButton) {
      Audio.init();
      if (this.mobile && !window.StarNovaAndroid) {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
      }
    }
    this.hud.banner(REGIONS.claro.name, REGIONS.claro.sub);
    if (!this.params.get('ir') && !this.params.get('jefe')) setTimeout(() => this.hud.toast('Habla con la Abuela Lechuza (E) para empezar'), 2500);
  }

  pause(v) {
    if (this.state === 'title' || this.state === 'dead' || this.state === 'ending') return;
    this.state = v ? 'pause' : 'play';
    $('pause').classList.toggle('hidden', !v);
    if (v && document.exitPointerLock) document.exitPointerLock();
  }
  openJournal(v) {
    if (this.state === 'title' && v) return;
    this.hud.refreshMissions();
    $('journal').classList.toggle('hidden', !v);
    if (this.state === 'play' || this.state === 'journal') this.state = v ? 'journal' : 'play';
    if (v && document.exitPointerLock) document.exitPointerLock();
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 72 : 62;
    this.camera.updateProjectionMatrix();
    this.fx.uniforms.uScale.value = h * 0.9;
  }

  /* ---------- reglas ---------- */
  diffCoef() { return 1 + this.time / 110; }
  hpScale() { return 1 + 0.38 * (this.diffCoef() - 1); }
  dmgScale() { return 1 + 0.22 * (this.diffCoef() - 1); }
  chestCost() { return Math.round(25 * (1 + 0.3 * (this.diffCoef() - 1))); }
  xpNext() { return Math.round(40 * Math.pow(this.level, 1.35)); }
  recompute() {
    const old = this.stats ? this.stats.maxHp : 0;
    this.stats = computeStats(this.level, this.items);
    if (old && this.stats.maxHp > old) this.hp += this.stats.maxHp - old;
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  addItem(id, silent) {
    this.items[id] = (this.items[id] || 0) + 1;
    this.recompute();
    this.hud.addItem(id);
    if (!silent) Audio.play('item');
  }
  dropItem(pos) {
    const id = rollItem();
    this.pickups.push(new Pickup(this, 'item', pos, id, { color: ITEMS[id].color, vel: { x: (Math.random() - 0.5) * 2, y: 6, z: (Math.random() - 0.5) * 2 } }));
  }
  addXp(v) {
    this.xp += v;
    while (this.xp >= this.xpNext()) {
      this.xp -= this.xpNext();
      this.level++;
      this.recompute();
      this.hp = this.stats.maxHp;
      Audio.play('level');
      this.hud.toast('¡Nivel ' + this.level + '!');
      this.fx.burst(this.player.center, '#9ce8d2', 30, 4);
    }
  }
  collect(p) {
    if (p.type === 'spark') { this.sparks += p.value; Audio.play('coin'); }
    else if (p.type === 'xp') { this.addXp(p.value); Audio.play('xp'); }
    else if (p.type === 'heal') { this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.15); Audio.play('coin'); this.fx.burst(this.player.center, '#ff9fb2', 12, 2); }
    else if (p.type === 'item') this.addItem(p.value);
    else if (p.type === 'fragment') { Audio.play('firefly'); this.missions.event('altar'); }
  }

  /* ---------- combate ---------- */
  aimPoint() {
    const cam = this.camera;
    const dir = this.cam.forward.clone();
    const origin = cam.position.clone();
    let far = 90;
    const hit = this.phys.ray(origin, dir, far, groups(0xffff, G.TERRAIN | G.PROP | G.GATE));
    if (hit) far = hit.toi;
    let best = null, bt = far;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const c = e.center();
      const t = c.clone().sub(origin).dot(dir);
      if (t < 0 || t > bt) continue;
      const d = origin.clone().addScaledVector(dir, t).distanceTo(c);
      if (d < e.r + 0.15) { best = e; bt = t; }
    }
    // ayuda de puntería en pantallas táctiles
    if (!best && this.input.touch) {
      let ba = 0.32;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const v = e.center().sub(origin);
        const dd = v.length();
        if (dd > 32) continue;
        const a = v.normalize().angleTo(dir);
        if (a < ba) { ba = a; best = e; bt = dd; }
      }
      if (best) return best.center();
    }
    $('crosshair').classList.toggle('hit', !!best);
    return origin.addScaledVector(dir, bt);
  }

  firePrimary() {
    const pl = this.player;
    const from = pl.muzzle;
    const target = this.aimPoint();
    const dir = target.clone().sub(from).normalize();
    const crit = Math.random() < this.stats.crit;
    const dmg = this.stats.dmg * (crit ? 2 : 1);
    this.projectiles.push(new Acorn(this, from, dir, dmg, { crit }));
    if (Math.random() < this.stats.twin) {
      const d2 = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.12);
      this.projectiles.push(new Acorn(this, from.clone().add(new THREE.Vector3(0, 0.05, 0)), d2, this.stats.dmg, {}));
    }
    Audio.play('shoot');
  }

  tailSwipe() {
    const pl = this.player;
    const c = pl.center;
    const R = 2.2;
    pl.tailT = 0.35;
    Audio.play('swipe');
    this.fx.ring(pl.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), '#ffe0c0', 22, 6);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = e.center().distanceTo(c);
      if (d < R + e.r) this.damageEnemy(e, this.stats.dmg * 2.2, { knock: 9, from: c, up: 4 });
    }
    for (const p of this.projectiles) if (p.kind === 'eorb' && p.pos().distanceTo(c) < R) { p.dead = true; this.fx.burst(p.pos(), '#ffffff', 6, 2); }
    const pushers = [...this.props.bells, ...this.props.crates, ...this.props.lanterns, ...this.props.crystals];
    for (const o of pushers) {
      const t = o.body ? o.body.translation() : (o.links ? o.links[o.links.length - 1].body.translation() : o.p);
      const d = new THREE.Vector3(t.x - c.x, 0, t.z - c.z);
      if (d.length() < R + 0.6) o.push(d.normalize(), 2.2);
    }
  }

  starRain() {
    const target = this.aimPoint();
    const dmg = this.stats.dmg * 2.6;
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3;
      const p = target.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      this.projectiles.push(new StarFall(this, p, dmg, i * 0.09));
    }
    Audio.play('special');
  }

  hitEnemySegment(a, b, rad) {
    const ab = b.clone().sub(a);
    const len2 = Math.max(1e-6, ab.lengthSq());
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0.3) continue;
      const c = e.center();
      const t = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / len2));
      const p = a.clone().addScaledVector(ab, t);
      if (p.distanceTo(c) < e.r + rad) return e;
    }
    return null;
  }

  damageEnemy(e, dmg, o = {}) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.12;
    this.hud.number(e.center().add(new THREE.Vector3(0, e.hh + 0.2, 0)), dmg, o.crit);
    Audio.play('hit');
    if (o.knock && e.vel && !e.isBoss) {
      const from = o.from || this.player.center;
      const d = e.center().sub(from).setY(0).normalize();
      e.vel.x += d.x * o.knock; e.vel.z += d.z * o.knock;
      if (o.up) e.vel.y = o.up;
    }
    if (o.proc) {
      if (Math.random() < this.stats.ember) this.explode(e.center(), 1.8, this.stats.dmg * 1.5, '#ff9a6b');
      if (Math.random() < this.stats.bleed) { e.bleed = 3; e.bleedDps = this.stats.dmg * 0.4; }
    }
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    this.kills++;
    const c = e.center();
    shatter(this, c, e.def.colors, e.isBoss ? 40 : 12, e.isBoss ? 0.2 : 0.08);
    this.fx.burst(c, e.def.colors[1], 20, 4);
    Audio.play('kill');
    this.cam.shake = Math.max(this.cam.shake, e.isBoss ? 1 : 0.06);
    const sparks = e.def.sparks * this.stats.sparkMul * (0.8 + 0.4 * this.diffCoef());
    const ns = Math.min(e.isBoss ? 24 : 5, Math.max(1, Math.round(sparks / 4)));
    for (let i = 0; i < ns; i++) this.pickups.push(new Pickup(this, 'spark', c, sparks / ns));
    const nx = e.isBoss ? 20 : 3;
    for (let i = 0; i < nx; i++) this.pickups.push(new Pickup(this, 'xp', c, e.def.xp / nx));
    if (Math.random() < 0.08) this.pickups.push(new Pickup(this, 'heal', c, 1));
    if (e.type === 'totem' && Math.random() < 0.25) this.dropItem(c);
    this.missions.event('kill', { region: regionAt(e.pos.x, e.pos.z) });
    if (e.isBoss) this.bossDefeated();
  }

  spawnEnemy(type, pos, force) {
    const e = new Enemy(this, type, pos);
    if (force) e.spawnT = 0.3;
    this.enemies.push(e);
    return e;
  }

  addProjectile(p) { this.projectiles.push(p); }

  explode(p, r, dmg, color) {
    this.fx.burst(p, color, 26, 6, 0.2, 0.8);
    this.fx.ring(p, color, 18, 5);
    Audio.play('hit');
    this.cam.shake = Math.max(this.cam.shake, 0.12);
    for (const e of this.enemies) if (!e.dead && e.center().distanceTo(p) < r + e.r) this.damageEnemy(e, dmg, { knock: 5, from: p, up: 3 });
    for (const o of [...this.props.crates, ...this.props.bells]) {
      const t = o.body.translation();
      const d = new THREE.Vector3(t.x - p.x, t.y - p.y, t.z - p.z);
      if (d.length() < r + 0.8) o.push(d.normalize(), 2);
    }
  }

  slam(p, r, dmg, big) {
    this.fx.ring(p.clone().add(new THREE.Vector3(0, 0.1, 0)), '#ffffff', big ? 40 : 24, big ? 12 : 7);
    this.fx.burst(p, '#e6d6f2', big ? 40 : 18, big ? 7 : 4);
    this.cam.shake = Math.max(this.cam.shake, big ? 0.5 : 0.2);
    Audio.play('rumble');
    const pl = this.player;
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    if (d < r && Math.abs(pl.pos.y - p.y) < 1.4) {
      this.hurtPlayer(dmg, p);
      pl.vel.y = 7;
    }
    for (const o of this.props.crates) {
      const t = o.body.translation();
      if (Math.hypot(t.x - p.x, t.z - p.z) < r) o.push(new THREE.Vector3(t.x - p.x, 0, t.z - p.z).normalize(), 1.5);
    }
  }

  hurtPlayer(dmg, from) {
    const pl = this.player;
    if (pl.invuln > 0 || this.god || this.state !== 'play') return;
    const d = dmg * 100 / (100 + this.stats.armor);
    this.hp -= d;
    pl.invuln = 0.7; pl.hurtT = 0.7;
    if (from) {
      const k = pl.center.sub(from).setY(0).normalize();
      pl.vel.x += k.x * 6; pl.vel.z += k.z * 6; pl.vel.y = Math.max(pl.vel.y, 3);
    }
    Audio.play('hurt');
    this.cam.shake = Math.max(this.cam.shake, 0.22);
    this.hud.number(pl.center.add(new THREE.Vector3(0, 0.5, 0)), d, false, '#ff8f8f');
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.items.corazon > 0) {
      this.items.corazon--;
      this.recompute();
      this.hp = this.stats.maxHp * 0.6;
      this.player.invuln = 2;
      this.hud.toast('El Corazón de Nova te devolvió la vida');
      this.fx.burst(this.player.center, '#ff8fb0', 40, 5);
      return;
    }
    this.state = 'dead';
    this.input.enabled = false;
    if (document.exitPointerLock) document.exitPointerLock();
    $('dead').classList.remove('hidden');
  }
  respawn() {
    $('dead').classList.add('hidden');
    this.player.teleport([0.5, 0.6, 2.5]);
    this.hp = this.stats.maxHp;
    this.sparks = Math.floor(this.sparks / 2);
    for (const e of this.enemies) if (!e.isBoss) { e.dead = true; }
    this.state = 'play';
    this.input.enabled = true;
  }
  fellOff() {
    const pl = this.player;
    pl.teleport(pl.lastSafe);
    this.cam.target.copy(pl.pos);
    if (!this.god) {
      this.hp -= this.stats.maxHp * 0.12;
      this.hud.toast('¡Uf! Pip vuelve a tierra firme');
      if (this.hp <= 0) this.die();
    }
  }

  onMissionComplete(m) {
    Audio.play('mission');
    this.hud.banner('Misión cumplida', m.title);
    if (m.fragment) {
      const n = this.missions.fragments();
      this.sparks += 40;
      this.hud.toast('Fragmento de Nova obtenido (' + n + '/4)');
      this.fx.burst(this.player.center, '#fff0b0', 40, 5, 0.2, 1.2);
      this.props.gate.setLights(Math.min(3, n));
      this.props.nova.setLit(n / 4 * 0.5);
      if (n >= 3 && !this.props.gate.open) {
        this.props.gate.openGate();
        setTimeout(() => this.hud.toast('El portón del Santuario de Nova se abrió (al sur)'), 1500);
        this.missions.state.guardian.discovered = true;
      }
    }
  }

  startBoss() {
    if (this.boss) return;
    const c = REGIONS.nova.center;
    this.boss = new Guardian(this, this.v3(c[0], 0.3, c[1] + 2));
    this.enemies.push(this.boss);
    this.hud.banner('El Guardián de Nova', 'protector de la estrella dormida');
  }
  bossDefeated() {
    this.missions.event('boss');
    this.props.nova.wake();
    this.sky.extraNight = 1;
    setTimeout(() => this.showEnding(), 6500);
  }
  showEnding() {
    this.state = 'ending';
    this.input.enabled = false;
    if (document.exitPointerLock) document.exitPointerLock();
    const s = Math.floor(this.time);
    $('endStats').innerHTML = `Tiempo: ${Math.floor(s / 60)} min ${s % 60} s · Nivel ${this.level} · ${this.kills} sombras · ${Object.values(this.items).reduce((a, b) => a + b, 0)} objetos<br>Las islas vuelven a brillar. Pero las sombras no descansan…`;
    $('ending').classList.remove('hidden');
  }

  /* ---------- interacción ---------- */
  nearestInteractable() {
    const p = this.player.pos;
    let best = null, bd = 1.7;
    for (const c of this.props.chests) {
      if (c.opened) continue;
      const d = c.p.distanceTo(p);
      if (d < bd) { bd = d; best = { type: 'chest', obj: c }; }
    }
    const o = this.props.owl.p;
    if (Math.hypot(o.x - p.x, o.z - p.z) < 2.3) best = { type: 'owl' };
    return best;
  }
  interact(it) {
    if (it.type === 'chest') {
      const cost = it.obj.cost();
      if (this.sparks >= cost) { this.sparks -= cost; it.obj.open(); }
      else { Audio.play('deny'); this.hud.toast('Necesitas ' + cost + ' chispas'); }
    } else if (it.type === 'owl') {
      this.owlLine = 0;
      this.openDialog();
    }
  }
  openDialog() {
    this.dialogOpen = true;
    this.state = 'dialog';
    $('dialog').classList.remove('hidden');
    $('dialog').querySelector('.who').textContent = 'Abuela Lechuza';
    $('dialog').querySelector('.text').textContent = OWL_LINES[this.owlLine];
    Audio.play('select');
  }
  advanceDialog() {
    this.owlLine++;
    if (this.owlLine >= OWL_LINES.length) {
      $('dialog').classList.add('hidden');
      this.dialogOpen = false;
      this.state = 'play';
      this.missions.discoverAll();
      this.hud.toast('Misiones anotadas en tu diario (Tab)');
      return;
    }
    $('dialog').querySelector('.text').textContent = OWL_LINES[this.owlLine];
    Audio.play('select');
  }

  /* ---------- director de enemigos (dificultad que crece con el tiempo) ---------- */
  runDirector(dt) {
    const D = this.director;
    D.t -= dt;
    const zone = this.spots.spawnZones.find(z => z.region === this.region);
    D.credits += dt * (0.9 + 0.5 * this.diffCoef()) * (zone ? 1 : 0);
    if (D.t > 0 || !zone || this.time < 12) return;
    D.t = 1.4;
    const alive = this.enemies.filter(e => !e.dead && !e.isBoss).length;
    const cap = Math.round(4 + 2 * this.diffCoef());
    if (alive >= cap) return;
    const c = this.diffCoef();
    const opts = [['sombra', 8, 1], ['farol', 11, 0.6], ['totem', 26, c > 1.6 ? 0.35 : 0]];
    const able = opts.filter(o => o[1] <= D.credits && o[2] > 0);
    if (!able.length) return;
    let tot = able.reduce((s, o) => s + o[2], 0), x = Math.random() * tot, pick = able[0];
    for (const o of able) { x -= o[2]; if (x <= 0) { pick = o; break; } }
    const pl = this.player.pos;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 12;
      const x2 = pl.x + Math.cos(a) * r, z2 = pl.z + Math.sin(a) * r;
      if (Math.hypot(x2 - zone.c[0], z2 - zone.c[1]) > zone.r) continue;
      const hit = this.phys.ray({ x: x2, y: pl.y + 14, z: z2 }, { x: 0, y: -1, z: 0 }, 30, groups(0xffff, G.TERRAIN));
      if (!hit || Math.abs(hit.point.y - pl.y) > 7) continue;
      const fly = pick[0] === 'farol';
      this.spawnEnemy(pick[0], this.v3(hit.point.x, hit.point.y + (fly ? 2.5 : 0.05), hit.point.z));
      D.credits -= pick[1];
      return;
    }
  }

  /* ---------- ciclo ---------- */
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    const t = now / 1000;
    const inp = this.input;

    if (inp.pressed.pause) { if (this.state === 'journal') this.openJournal(false); else this.pause(this.state === 'play'); }
    if (inp.pressed.journal) this.openJournal(this.state !== 'journal');
    if (inp.pressed.mute) this.toggleMute();
    if (this.state === 'dialog' && (inp.pressed.interact || inp.pressed.jump)) this.advanceDialog();

    if (this.state === 'play') {
      this.acc += dt;
      let first = true;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP, first);
        first = false;
        this.acc -= STEP;
        steps++;
      }
      if (steps >= 5) this.acc = 0;
    } else if (this.state === 'title') {
      this.titleT += dt;
      inp.lookDX = -dt * 0.08;
      inp.lookDY = 0;
    }

    const focus = this.player.pos.clone().add(new THREE.Vector3(0, 0.55, 0));
    this.cam.update(dt, (this.state === 'play' || this.state === 'title') ? inp : { lookDX: 0, lookDY: 0, zoom: 0 }, focus, t);
    this.fx.update(dt);
    this.sky.update(dt, this.camera.position, t);
    this.scene.fog.color.copy(this.sky.fogColor);
    this.hemi.color.copy(this.sky.u.hor.value).lerp(new THREE.Color('#ffffff'), 0.35);
    this.sun.intensity = 2.1 * (1 - this.sky.night * 0.45);
    this.sun.position.copy(this.player.pos).add(this.sunOffset);
    this.sun.target.position.copy(this.player.pos);
    this.player.animate(dt, t);
    if (this.player.tailT > 0) { this.player.tailT -= dt; this.player.model.rotation.y += (1 - this.player.tailT / 0.35) * Math.PI * 2; }
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'title') { this.hud.update(dt); this.hud.draw(this.camera, dt); }
    inp.consume();
  }

  step(dt, first) {
    const inp = this.input;
    const pressed = inp.pressed;
    if (!first) for (const k in pressed) pressed[k] = false;
    this.time += dt;
    this.skills.update(dt);
    const pl = this.player;

    if (inp.held.primary) this.aimHold = 0.6; else this.aimHold = Math.max(0, this.aimHold - dt);
    if (inp.held.primary && this.skills.ready('primary')) { this.skills.use('primary'); this.firePrimary(); }
    if (pressed.secondary && this.skills.ready('secondary')) { this.skills.use('secondary'); this.tailSwipe(); }
    if (pressed.special && this.skills.ready('special')) { this.skills.use('special'); this.starRain(); }
    if (pressed.track) {
      const ids = Object.keys(this.missions.state).filter(id => this.missions.state[id].discovered && !this.missions.state[id].done);
      if (ids.length) { this.missions.tracked = ids[(ids.indexOf(this.missions.tracked) + 1) % ids.length]; this.hud.refreshMissions(); }
    }

    pl.update(dt, inp, this.cam);

    // regeneración y hoguera
    this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.regen * dt);
    if (pl.pos.distanceTo(this.props.campfire.p) < 2.6) this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.12 * dt);

    // cometa fiel
    if (this.stats.comet > 0) {
      this.cometT -= dt;
      if (this.cometT <= 0) {
        this.cometT = 3;
        let best = null, bd = 25;
        for (const e of this.enemies) { if (e.dead) continue; const d = e.center().distanceTo(pl.pos); if (d < bd) { bd = d; best = e; } }
        if (best) this.projectiles.push(new StarFall(this, best.pos.clone(), this.stats.dmg * 2 * this.stats.comet, 0));
      }
    }

    for (const e of this.enemies) if (!e.dead) e.update(dt, this.time);
    for (const p of this.projectiles) if (!p.dead) p.update(dt);
    const P = this.props;
    for (const b of P.bells) b.update(dt);
    for (const c of P.crystals) c.update(dt, this.time);
    for (const f of P.fireflies) f.update(dt, this.time);
    for (const c of P.crates) c.update(dt);
    for (const c of P.chests) c.update(dt);
    for (const l of P.lanterns) l.update(dt);
    P.bridge.update(dt);
    P.gate.update(dt);
    P.campfire.update(dt, this.time);
    P.owl.update(dt, this.time);
    P.nova.update(dt, this.time);
    for (const p of this.pickups) if (!p.dead) p.update(dt, this.time);
    for (const d of this.debris) if (!d.dead) d.update(dt);

    this.runDirector(dt);

    this.phys.step((a, b) => {
      if (a && a.onCollide) a.onCollide(b);
      if (b && b.onCollide) b.onCollide(a);
    });

    // limpieza
    this.enemies = this.enemies.filter(e => { if (e.dead) { e.destroy(); return false; } return true; });
    this.projectiles = this.projectiles.filter(p => { if (p.dead) { p.destroy(); return false; } return true; });
    this.pickups = this.pickups.filter(p => { if (p.dead) { p.destroy(); return false; } return true; });
    this.debris = this.debris.filter(d => { if (d.dead) { d.destroy(); return false; } return true; });
    if (this.boss && this.boss.dead) this.bossDone = true;

    // regiones
    const reg = regionAt(pl.pos.x, pl.pos.z);
    if (reg && reg !== this.region) {
      this.region = reg;
      this.hud.banner(REGIONS[reg].name, REGIONS[reg].sub);
      if (reg !== 'claro') this.missions.discover(reg);
    }
    // jefe
    const nc = REGIONS.nova.center;
    if (P.gate.open && !this.boss && Math.hypot(pl.pos.x - nc[0], pl.pos.z - nc[1]) < 13) this.startBoss();

    // interacción
    const it = this.nearestInteractable();
    if (it) {
      this.hud.prompt(it.type === 'chest' ? `E · Abrir cofre (${it.obj.cost()} chispas)` : 'E · Hablar con la Abuela Lechuza');
      if (pressed.interact) this.interact(it);
    } else this.hud.prompt(null);
  }
}

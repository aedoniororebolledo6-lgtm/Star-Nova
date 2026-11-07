/* Star Nova — arranque: carga Rapier (WASM) y crea el juego. */
import { initPhysics } from './physics.js';
import { Game } from './game.js';

const params = new URLSearchParams(location.search);
const loading = document.getElementById('loading');

async function boot() {
  try {
    await initPhysics();
    const game = new Game(document.getElementById('game'), params);
    game.init();
    window.__starnova = { game, ready: true };
    loading.classList.add('fade');
    setTimeout(() => loading.remove(), 700);
  } catch (err) {
    console.error(err);
    document.getElementById('loadingText').textContent = 'No se pudo iniciar: ' + (err && err.message ? err.message : err);
    window.__starnova = { error: String(err && err.stack || err) };
  }
}
/* En la app de Android: muestra la versión y avisa si hay una compilación nueva en GitHub. */
const REPO = 'aedoniororebolledo6-lgtm/Star-Nova';
async function checkUpdate() {
  const A = window.StarNovaAndroid;
  if (!A) return;
  let mine = 0;
  try { mine = A.build(); document.getElementById('version').textContent = 'versión ' + A.version(); } catch (e) { return; }
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/latest`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    const m = /compilaci[oó]n\s*#?(\d+)/i.exec(j.name || '');
    const latest = m ? parseInt(m[1], 10) : 0;
    if (mine > 0 && latest > mine) {
      const b = document.getElementById('btnUpdate');
      b.textContent = 'Actualizar a la versión 0.1.' + latest;
      b.classList.remove('hidden');
      b.onclick = () => { location.href = `https://github.com/${REPO}/releases/latest/download/StarNova.apk`; };
    }
  } catch (e) { /* sin internet: se juega igual */ }
}

boot();
checkUpdate();

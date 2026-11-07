# Star Nova — guía para Claude

Aventura **3D de mundo abierto** para el navegador (se juega en el teléfono **en horizontal** o en PC).
El dueño habla **español**: responde siempre en español, claro y sin tecnicismos innecesarios.

## Visión (lo que pidió el dueño)
- **Pip**, una ardilla diminuta, recorre islas flotantes para reunir los fragmentos de la estrella **Nova**.
- **Mundo abierto con misiones** (no niveles lineales): cada región tiene misiones que se hacen en cualquier orden.
- Sensación de **roguelite de acción en tercera persona** (inspiración: Risk of Rain 2): habilidades con recarga,
  enemigos que aparecen y se hacen más fuertes con el tiempo (reloj de dificultad), chispas, cofres y
  objetos que se acumulan.
- Estética **inspirada en Monument Valley**: arquitectura geométrica pastel, arcos, cúpulas, cielos en
  degradado, bruma. **Todo es original**: no copiar personajes, niveles, música ni arte de ese juego.
- **Físicas en todo** (motor Rapier): personaje, enemigos, proyectiles, campanas, puentes, cajas, esquirlas.

## Tecnología (y por qué)
- **Three.js 0.180** (render 3D) + **Rapier 3D 0.21** (físicas, el mismo motor que usa Bevy). Ambos están
  copiados en `vendor/` (no hace falta internet ni compilar). Licencias en `vendor/`.
- JavaScript con módulos ES y `importmap` en `index.html`. **Sin paso de compilación**: se edita y se recarga.
- Investigación de motores y repositorios: `docs/investigacion.md` (Godot, Bevy, Babylon, PlayCanvas, etc.).
- Si algún día se quiere APK nativo: empaquetar la web (Capacitor/TWA) o portar a Godot (ver la investigación).

## Ver el juego (los "ojos")
1. **En el contenedor** (rápido, usar siempre tras un cambio visual):
   ```bash
   node tools/ojos.cjs <carpeta_scratchpad>          # todas las escenas + prueba de movimiento
   node tools/ojos.cjs <carpeta_scratchpad> coral    # solo escenas cuyo nombre contenga "coral"
   ```
   Abre Chromium (WebGL por software), recorre escenas con atajos de URL, guarda `NN_nombre.png` y
   `report.txt` (errores de consola, FPS aproximados, posición, enemigos, llamadas de dibujo, pruebas).
   Mira las capturas con **Read**. Los FPS por software son bajos (~8–20): solo sirven para comparar.
2. **En CI**: cada push corre `.github/workflows/ojos.yml` y publica capturas + informe en el release
   **`diagnostico`**. Descárgalas con `bash tools/capturas.sh <carpeta> [filtro]`.
   El trabajo falla si `report.txt` tiene `consola:`, `ERROR` o `FALLO`.
3. Servidor local para probar a mano: `node tools/serve.mjs 8080` → `http://127.0.0.1:8080/`.
4. **Después de cualquier cambio visual, mira las capturas** antes de dar el trabajo por terminado.
   Si el dueño manda capturas de su teléfono, úsalas también.

### Atajos de URL (para pruebas y capturas)
`index.html?auto=1` empieza sin pantalla de título. Se combinan con `&`:
- `ir=claro|coral|campana|menta|torre|lavanda|puente|altar|nova|santuario` — aparecer en ese lugar.
- `cam=yaw,pitch,dist` — orientar la cámara (yaw 0 = mirando al norte, -z).
- `dios=1` (sin daño) · `t=600` (segundos de partida: sube la dificultad) · `items=1` (todos los objetos).
- `frag=N` (completa N misiones de fragmento; con 3 se abre el santuario) · `puente=1` (activa los cristales).
- `jefe=1` (3 fragmentos + dentro del santuario: empieza el jefe) · `enemigos=N` (N enemigos alrededor).
- `diario=1` · `pausa=1` · `final=1` (pantalla final) · `hud=0` (sin interfaz, para fotos bonitas).
- `ojos=1` lo pone `tools/ojos.cjs` (conserva el búfer de dibujo para las capturas).
- En la consola del navegador: `window.__starnova.game` da acceso a todo el estado.

## Mapa del código
- `index.html` — interfaz (HUD, pantallas, controles táctiles) e `importmap`. `css/style.css` — estilos.
- `js/main.js` — arranque: inicia Rapier (WASM) y crea `Game`.
- `js/game.js` — **núcleo**: ciclo fijo de 60 pasos/s, habilidades, daño/críticos/efectos de objetos,
  director de enemigos (dificultad por tiempo), interacción (cofres, lechuza), misiones, jefe, atajos.
- `js/physics.js` — mundo Rapier, **grupos de colisión** (`G`), controladores de personaje, rayos.
- `js/world/palette.js` — paletas y nombres de las 5 regiones; mezcla de cielo por posición.
- `js/world/builder.js` — piezas de arquitectura (caja, cilindro, torre, arco, cúpula, isla, pasarela…);
  une la geometría de cada región en **una malla** y crea los colisionadores fijos. Sombreado horneado
  por cara (las caras laterales toman el color `shade` de la región).
- `js/world/layout.js` — **el mapa**: dónde está cada isla, torre, campana, cristal, cofre, etc.
- `js/entities/models.js` — modelos low-poly hechos con primitivas (Pip, Sombra, Farol, Tótem, Guardián, Lechuza).
- `js/entities/player.js` — Pip: movimiento (controlador cinemático), doble salto, voltereta, animación.
- `js/entities/enemies.js` — enemigos (`ENEMY_DEFS`), IA, el jefe `Guardian`, `shatter` (esquirlas).
- `js/combat.js` — bellotas, lluvia de estrellas, orbes enemigos, recogibles (chispas, xp, objetos), esquirlas.
- `js/props.js` — campanas (articulación esférica), cristales, cajas, puente de tablones (bisagras),
  luciérnagas, cofres, portón, farolillos (cadena), hoguera, lechuza, estrella Nova.
- `js/items.js` — objetos acumulables, rarezas, `computeStats`, íconos 2D.
- `js/missions.js` — misiones, progreso y objetivos del marcador.
- `js/hud.js` — HUD en DOM + capa 2D (números de daño, marcador de misión).
- `js/sky.js` — cielo degradado, estrellas, nubes, islas lejanas. `js/fx.js` — partículas (un solo `Points`).
- `js/input.js` — acciones abstractas (teclado/ratón/táctil). `js/camera.js` — cámara sobre el hombro.
- `js/audio.js` — sonidos sintetizados con WebAudio (sin archivos). `js/util.js` — utilidades.
- `tools/ojos.cjs` (capturas), `tools/serve.mjs` (servidor), `tools/capturas.sh` (bajar capturas de CI).
- `.github/workflows/ojos.yml` (capturas en cada push), `pages.yml` (publica el juego al fusionar en `main`).

## Reglas del proyecto
- Unidades: **1 = 1 metro**. Pip mide ~0.55. Gravedad −22. Arriba es +y; el norte es −z.
- Todo lo que choca va por Rapier. Usa los grupos de `physics.js` (`groups(miembro, filtro)`); al crear
  un colisionador que el juego deba reconocer, regístralo con `phys.own(collider, objeto)`.
  Si el objeto tiene `onHit(proyectil)` o `push(dir, fuerza)`, las bellotas y el coletazo lo afectan.
- Los objetos con cuerpo deben tener `destroy()` que llame a `phys.removeBody` y quite la malla.
- Rendimiento en teléfono: la arquitectura estática va por `Builder` (una malla por región). No crear
  geometrías ni materiales por cuadro; reutiliza `mat()` y `GEO` de `models.js`. Máximo 1 luz puntual.
- Textos visibles **en español**. Estilo de la interfaz: suave, redondeado, tipografía serif para títulos.
- Nada de identificadores de modelo en commits, PR ni código.
- Licencias: Three.js (MIT) y Rapier (Apache-2.0) en `vendor/`; mantener sus avisos.
- **Nunca** subir llaves, contraseñas ni tokens al repositorio (es público). Van en Secrets o en la caché de CI.

## Control de avance
Hecho (v0.1):
- [x] Mundo abierto: El Claro + 4 regiones unidas por pasarelas; cielo y niebla cambian por región.
- [x] Pip con controlador de personaje (Rapier): correr, doble salto, voltereta, cámara con colisión.
- [x] Habilidades: bellotazo (clic), coletazo (Q), voltereta (Shift), lluvia estelar (R).
- [x] Enemigos: Sombra, Farol, Tótem + director que escala con el tiempo; jefe El Guardián.
- [x] Chispas, experiencia y niveles, cofres, 14 objetos acumulables (3 rarezas).
- [x] Misiones: Tres Campanas, Luciérnagas, Plaga de Sombras, Puente Dormido, Guardián (+ final).
- [x] Físicas: campanas colgantes, puente de tablones con bisagras, cajas, farolillos en cadena, esquirlas.
- [x] Controles táctiles en horizontal (joystick + botones + ayuda de puntería), aviso de girar el teléfono.
- [x] Ojos: `tools/ojos.cjs` + workflow con release `diagnostico`; publicación en GitHub Pages.

Pendiente / ideas:
- [ ] Guardado de progreso (misiones, objetos) en `localStorage`.
- [ ] Más misiones por región y PNJ; misiones repetibles (escoltas, defender la hoguera, carreras).
- [ ] Más enemigos y élites (con modificadores), más objetos y equipo activo.
- [ ] Música adaptativa; mezcla de sonido más rica.
- [ ] Carga por zonas (streaming) si el mundo crece mucho; nivel de detalle (LOD) para islas lejanas.
- [ ] Postproceso suave (bloom en estrellas/cristales) con opción para teléfonos lentos.
- [ ] Empaquetar como APK (Capacitor/TWA) si el dueño lo pide.

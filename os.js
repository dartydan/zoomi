/* ============================================================
   ZoomiOS — three.js + GSAP showcase for zoomi.co
   ------------------------------------------------------------
   Desktop : interactive 3D space (core + 4 business "satellites")
             with a menu bar, dock, and draggable app windows.
   Mobile  : a phone-OS home screen with app tiles + full-screen
             sheets, over a lightweight 3D wallpaper.
   ============================================================ */

import * as THREE from 'three';

const gsap = window.gsap;
const root = document.documentElement;

/* ---- business data: single source of truth ---------------- */
const BUSINESSES = [
    {
        id: 'audit',
        name: 'Zoomi Audit',
        domain: 'audit.zoomi.co',
        url: 'https://audit.zoomi.co',
        glyph: '📈',
        favicon: 'https://audit.zoomi.co/favicon.ico',
        accent: '#5db8ff',
        status: 'Live',
        tagline: 'Digital marketing & SEO',
        desc: 'On-page audits, technical SEO, analytics, and AI-assisted content systems that show you what search engines see — and how to win the page.',
    },
    {
        id: 'gov',
        name: 'Zoomi Government',
        domain: 'gov.zoomi.co',
        url: 'https://gov.zoomi.co',
        glyph: '🏛️',
        favicon: 'https://gov.zoomi.co/icon.png',
        accent: '#f8d778',
        status: 'SAM active',
        tagline: 'Government contracting',
        desc: 'Public-sector contracting, SAM opportunity tracking, and vendor fulfillment. SAM active · CAGE 217B9 · UEI WC51DCJCFW17.',
    },
    {
        id: 'margin',
        name: 'Margin',
        domain: 'margin.zoomi.co',
        url: 'https://margin.zoomi.co',
        glyph: '📖',
        favicon: null,
        accent: '#f0a3ff',
        status: 'Bible app',
        tagline: 'Scripture, with room to think',
        desc: 'Read the Bible with room to think — notes in the margin, study tools, and a calm, focused reading experience on every device.',
    },
    {
        id: 'rent',
        name: 'Zoomi Rentals',
        domain: 'rent.zoomi.co',
        url: 'https://rent.zoomi.co',
        glyph: '🌀',
        favicon: 'https://rent.zoomi.co/icon.png',
        accent: '#85e0a3',
        status: 'Live',
        tagline: 'Washer & dryer rentals',
        desc: 'Washer and dryer rentals delivered, installed, and serviced — flexible terms with maintenance handled for you, start to finish.',
    },
];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_MOBILE = window.matchMedia('(max-width: 820px)').matches;
const byId = (id) => BUSINESSES.find((b) => b.id === id);

// Mobile app-icon content: the site's real favicon, falling back to the emoji
// glyph if the business has none (margin) or the image fails to load.
function iconInner(b) {
    if (!b.favicon) return `<span aria-hidden="true">${b.glyph}</span>`;
    return `<img class="favicon" src="${b.favicon}" alt="" referrerpolicy="no-referrer"`
        + ` onload="if(this.naturalWidth&&this.naturalWidth<64)this.closest('.ico').classList.add('ico-small')"`
        + ` onerror="this.remove();this.closest('.ico').classList.add('ico-fallback')">`
        + `<span class="glyph-fallback" aria-hidden="true">${b.glyph}</span>`;
}

/* ============================================================
   1. UI CONSTRUCTION (dock, windows, app grid, sheets)
   ============================================================ */
function buildDesktopUI() {
    const dock = document.getElementById('dock');
    const windows = document.getElementById('windows');
    const desk = document.getElementById('desktopIcons');

    BUSINESSES.forEach((b, i) => {
        // Desktop icon (top-left, like a real OS desktop)
        const di = document.createElement('button');
        di.className = 'desk-icon';
        di.type = 'button';
        di.dataset.id = b.id;
        di.setAttribute('aria-label', `Open ${b.name} — ${b.tagline}`);
        di.innerHTML = `
            <span class="ico" aria-hidden="true" style="background:linear-gradient(150deg, ${b.accent}, ${b.accent}99)">${b.glyph}</span>
            <span class="label">${b.name}</span>`;
        di.addEventListener('click', () => openWindow(b.id));
        desk.appendChild(di);

        // Dock icon
        const app = document.createElement('button');
        app.className = 'dock-app';
        app.type = 'button';
        app.dataset.id = b.id;
        app.dataset.name = b.name;
        app.setAttribute('aria-label', `Open ${b.name} — ${b.tagline}`);
        app.style.background = `linear-gradient(150deg, ${b.accent}38, rgba(255,255,255,0.10))`;
        app.innerHTML = `<span aria-hidden="true">${b.glyph}</span><span class="accent" style="background:${b.accent}"></span>`;
        app.addEventListener('click', () => openWindow(b.id));
        dock.appendChild(app);

        // Window
        const win = document.createElement('section');
        win.className = 'window';
        win.dataset.id = b.id;
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', b.name);
        win.style.left = `${18 + i * 3}%`;
        win.style.top = `${20 + i * 4}%`;
        win.innerHTML = `
            <header class="window-bar" data-drag>
                <span class="traffic">
                    <span class="close" role="button" tabindex="0" aria-label="Close ${b.name}"></span>
                    <span></span><span></span>
                </span>
                <span class="win-title">${b.domain}</span>
            </header>
            <div class="window-body">
                <span class="badge" style="color:${b.accent}">${b.status}</span>
                <div class="glyph" aria-hidden="true">${b.glyph}</div>
                <h2>${b.name}</h2>
                <p class="tagline" style="color:${b.accent}">${b.tagline}</p>
                <p class="desc">${b.desc}</p>
                <a class="visit" href="${b.url}" style="background:linear-gradient(90deg, ${b.accent}, ${b.accent}cc)">
                    Open ${b.domain} <span aria-hidden="true">↗</span>
                </a>
                <span class="domain">${b.url}</span>
            </div>`;
        windows.appendChild(win);

        // Close handlers
        const closeEl = win.querySelector('.close');
        const close = () => closeWindow(b.id);
        closeEl.addEventListener('click', close);
        closeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); close(); } });

        makeDraggable(win, win.querySelector('[data-drag]'));
        win.addEventListener('pointerdown', () => bringToFront(win));
    });
}

function buildMobileUI() {
    const grid = document.getElementById('appGrid');
    const sheets = document.getElementById('sheets');

    BUSINESSES.forEach((b) => {
        const tile = document.createElement('button');
        tile.className = 'app-tile';
        tile.type = 'button';
        tile.dataset.id = b.id;
        tile.setAttribute('aria-label', `Open ${b.name} — ${b.tagline}`);
        tile.innerHTML = `
            <span class="ico" style="background:linear-gradient(150deg, ${b.accent}, ${b.accent}99)">${iconInner(b)}</span>
            <span class="name">${b.name}</span>
            <span class="sub">${b.tagline}</span>`;
        tile.addEventListener('click', () => openSheet(b.id));
        grid.appendChild(tile);

        const sheet = document.createElement('section');
        sheet.className = 'sheet';
        sheet.dataset.id = b.id;
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', b.name);
        sheet.innerHTML = `
            <div class="sheet-grab" aria-hidden="true"></div>
            <button class="sheet-close" type="button" aria-label="Close ${b.name}">✕</button>
            <div class="sheet-body">
                <span class="ico" style="background:linear-gradient(150deg, ${b.accent}, ${b.accent}99)">${iconInner(b)}</span>
                <span class="badge" style="color:${b.accent}">${b.status}</span>
                <h2>${b.name}</h2>
                <p class="tagline" style="color:${b.accent}">${b.tagline}</p>
                <p class="desc">${b.desc}</p>
                <a class="visit" href="${b.url}" style="background:linear-gradient(90deg, ${b.accent}, ${b.accent}cc)">
                    Open ${b.domain} <span aria-hidden="true">↗</span>
                </a>
                <span class="domain">${b.url}</span>
            </div>`;
        sheets.appendChild(sheet);
        sheet.querySelector('.sheet-close').addEventListener('click', () => closeSheet(b.id));
    });
}

/* ---- window helpers --------------------------------------- */
let zCounter = 40;
function bringToFront(win) { win.style.zIndex = String(++zCounter); }

function openWindow(id) {
    const win = document.querySelector(`.window[data-id="${id}"]`);
    if (!win) return;
    const dockApp = document.querySelector(`.dock-app[data-id="${id}"]`);
    if (dockApp) dockApp.classList.add('running');
    bringToFront(win);
    win.classList.add('open');
    focusSatellite(id);
    if (REDUCED) {
        gsap.set(win, { opacity: 1, scale: 1 });
    } else {
        gsap.fromTo(win, { opacity: 0, scale: 0.92, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(1.6)' });
    }
    win.querySelector('.visit').focus({ preventScroll: true });
}

function closeWindow(id) {
    const win = document.querySelector(`.window[data-id="${id}"]`);
    if (!win) return;
    const finish = () => {
        win.classList.remove('open');
        const dockApp = document.querySelector(`.dock-app[data-id="${id}"]`);
        if (dockApp) dockApp.classList.remove('running');
        if (!document.querySelector('.window.open')) unfocusSatellite();
    };
    if (REDUCED) { finish(); return; }
    gsap.to(win, { opacity: 0, scale: 0.92, y: 10, duration: 0.25, ease: 'power2.in', onComplete: finish });
}

function makeDraggable(win, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
        if (e.target.classList.contains('close')) return;
        dragging = true;
        const rect = win.getBoundingClientRect();
        win.style.left = `${rect.left}px`;
        win.style.top = `${rect.top}px`;
        win.style.right = 'auto';
        sx = e.clientX; sy = e.clientY; ox = rect.left; oy = rect.top;
        handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const nx = Math.max(0, Math.min(window.innerWidth - 60, ox + (e.clientX - sx)));
        const ny = Math.max(40, Math.min(window.innerHeight - 60, oy + (e.clientY - sy)));
        win.style.left = `${nx}px`;
        win.style.top = `${ny}px`;
    });
    handle.addEventListener('pointerup', (e) => { dragging = false; try { handle.releasePointerCapture(e.pointerId); } catch (_) {} });
}

/* ---- mobile sheet helpers --------------------------------- */
function openSheet(id) {
    const sheet = document.querySelector(`.sheet[data-id="${id}"]`);
    if (!sheet) return;
    sheet.classList.add('open');
    if (REDUCED) {
        gsap.set(sheet, { y: 0, opacity: 1 });
    } else {
        gsap.fromTo(sheet, { y: '100%' }, { y: '0%', duration: 0.5, ease: 'power3.out' });
    }
    sheet.querySelector('.sheet-close').focus({ preventScroll: true });
}
function closeSheet(id) {
    const sheet = document.querySelector(`.sheet[data-id="${id}"]`);
    if (!sheet) return;
    const finish = () => sheet.classList.remove('open');
    if (REDUCED) { finish(); return; }
    gsap.to(sheet, { y: '100%', duration: 0.32, ease: 'power2.in', onComplete: finish });
}

/* ============================================================
   2. THREE.JS SCENE
   ============================================================ */
let renderer, scene, camera, coreGroup, wire, particles, glow;
const satellites = [];        // { id, group, basePos, phase }
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);

// camera control state
const camHome = new THREE.Vector3(0, 0, 9);
const camTarget = camHome.clone();
const lookHome = new THREE.Vector3(0, 0, 0);
const lookTarget = lookHome.clone();
const parallax = new THREE.Vector2(0, 0);     // -1..1 input
const parallaxTarget = new THREE.Vector2(0, 0);
let focusedId = null;

function radialTexture(color) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, color);
    g.addColorStop(0.25, color.replace(')', ', 0.55)').replace('rgb', 'rgba'));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

function makeSatellite(b) {
    const group = new THREE.Group();
    const accent = new THREE.Color(b.accent);
    const mat = (opts = {}) => new THREE.MeshStandardMaterial({
        color: opts.color || accent,
        metalness: opts.metalness ?? 0.35,
        roughness: opts.roughness ?? 0.35,
        emissive: opts.emissive || accent,
        emissiveIntensity: opts.emissiveIntensity ?? 0.22,
    });

    if (b.id === 'audit') {
        // radar / analytics rings
        for (let i = 1; i <= 3; i++) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26 * i, 0.018, 10, 48), mat({ emissiveIntensity: 0.4 }));
            ring.rotation.x = Math.PI / 2;
            group.add(ring);
        }
        const blip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 16), mat({ color: new THREE.Color('#ffffff'), emissiveIntensity: 0.8 }));
        blip.position.set(0.55, 0, 0);
        blip.userData.spin = true;
        group.add(blip);
        group.userData.blip = blip;
    } else if (b.id === 'gov') {
        // obelisk / monument
        const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 1.0, 4), mat({ metalness: 0.6, roughness: 0.25 }));
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), mat({ metalness: 0.5 }));
        base.position.y = -0.56;
        group.add(obelisk, base);
    } else if (b.id === 'margin') {
        // open book
        const pageMat = mat({ color: new THREE.Color('#f5ecff'), emissive: accent, emissiveIntensity: 0.12, metalness: 0.05, roughness: 0.7 });
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.66), pageMat);
        const right = left.clone();
        left.position.set(-0.27, 0, 0);
        left.rotation.z = 0.22;
        right.position.set(0.27, 0, 0);
        right.rotation.z = -0.22;
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.66), mat({ emissiveIntensity: 0.5 }));
        group.add(left, right, spine);
    } else if (b.id === 'rent') {
        // washing machine
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.55), mat({ color: new THREE.Color('#eef4ff'), emissive: accent, emissiveIntensity: 0.08, metalness: 0.2, roughness: 0.4 }));
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 14, 32), mat({ emissiveIntensity: 0.45 }));
        rim.position.z = 0.28;
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.5, emissive: accent, emissiveIntensity: 0.4, metalness: 0.1, roughness: 0.1 }));
        glass.position.z = 0.281;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), mat({ emissiveIntensity: 0.6 }));
        knob.position.set(0.22, 0.26, 0.28);
        group.add(body, rim, glass, knob);
        group.userData.spinner = rim;
    }

    // invisible hit sphere for easy raycasting
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.bizId = b.id;
    group.add(hit);

    return group;
}

function initThree() {
    const canvas = document.getElementById('scene');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_MOBILE, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_MOBILE ? 1.6 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.copy(camHome);

    scene.add(new THREE.AmbientLight(0x88aaff, 0.7));
    const key = new THREE.PointLight(0x9fdcff, 1.3, 60);
    key.position.set(6, 8, 10);
    scene.add(key);
    const fill = new THREE.PointLight(0x4ee4d6, 0.7, 60);
    fill.position.set(-8, -4, 6);
    scene.add(fill);

    // central Z core
    coreGroup = new THREE.Group();
    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.0, 1),
        new THREE.MeshStandardMaterial({ color: 0x0e2138, metalness: 0.85, roughness: 0.18, emissive: 0x123a5c, emissiveIntensity: 0.6, flatShading: true })
    );
    wire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 1),
        new THREE.MeshBasicMaterial({ color: 0x4ee4d6, wireframe: true, transparent: true, opacity: 0.22 })
    );
    glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgb(93,184,255)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    glow.scale.set(6, 6, 1);
    coreGroup.add(glow, core, wire);
    scene.add(coreGroup);

    // particle starfield
    const count = IS_MOBILE ? 520 : 1300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 7 + Math.random() * 24;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xbcd6ff, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(particles);

    // business satellites (desktop only — mobile keeps a clean wallpaper)
    if (!IS_MOBILE) {
        const R = 3.5;
        BUSINESSES.forEach((b, i) => {
            const angle = (i / BUSINESSES.length) * Math.PI * 2 - Math.PI / 2;
            const group = makeSatellite(b);
            const basePos = new THREE.Vector3(Math.cos(angle) * R, Math.sin(angle * 1.0) * 0.9 + (i % 2 ? 0.4 : -0.4), Math.sin(angle) * R * 0.5);
            group.position.copy(basePos);
            scene.add(group);
            satellites.push({ id: b.id, group, basePos, phase: i * 1.7 });
        });
    }

    window.addEventListener('resize', onResize);
    if (!IS_MOBILE) {
        window.addEventListener('pointermove', onPointerMove);
        renderer.domElement.addEventListener('click', onCanvasClick);
    }
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerMove(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    parallaxTarget.set(pointer.x, pointer.y);
}

let hovered = null;
const hoverLabel = () => document.getElementById('hoverLabel');

function onCanvasClick() {
    if (hovered) openWindow(hovered);
}

function focusSatellite(id) {
    focusedId = id;
    const sat = satellites.find((s) => s.id === id);
    if (!sat) return;
    const p = sat.basePos;
    camTarget.set(p.x * 0.4, p.y * 0.4 + 0.2, 8.2);
    lookTarget.set(p.x * 0.55, p.y * 0.55, p.z * 0.55);
}
function unfocusSatellite() {
    focusedId = null;
    camTarget.copy(camHome);
    lookTarget.copy(lookHome);
}

function updateHover() {
    if (IS_MOBILE || satellites.length === 0) return;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(satellites.map((s) => s.group), true);
    let id = null;
    for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.bizId) o = o.parent;
        if (o && o.userData.bizId) { id = o.userData.bizId; break; }
    }
    if (id !== hovered) {
        hovered = id;
        renderer.domElement.style.cursor = id ? 'pointer' : 'default';
        const label = hoverLabel();
        if (id) {
            const b = byId(id);
            label.innerHTML = `${b.name}<small>${b.domain}</small>`;
            label.classList.add('show');
        } else {
            label.classList.remove('show');
        }
    }
    // keep label glued to the satellite
    if (hovered) {
        const sat = satellites.find((s) => s.id === hovered);
        const v = sat.group.position.clone().project(camera);
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const label = hoverLabel();
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
    }
}

function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = REDUCED ? 0 : 1;

    if (coreGroup) {
        coreGroup.rotation.y = t * 0.12 * dt;
        wire.rotation.y = -t * 0.18 * dt;
        wire.rotation.x = t * 0.08 * dt;
        const pulse = 1 + Math.sin(t * 1.4) * 0.04 * dt;
        glow.scale.set(6 * pulse, 6 * pulse, 1);
    }
    if (particles) particles.rotation.y = t * 0.012 * dt;

    satellites.forEach((s) => {
        const g = s.group;
        g.position.y = s.basePos.y + Math.sin(t * 0.8 + s.phase) * 0.18 * dt;
        g.rotation.y += 0.004 * dt;
        const target = (hovered === s.id || focusedId === s.id) ? 1.22 : 1;
        g.scale.x += (target - g.scale.x) * 0.12;
        g.scale.y = g.scale.z = g.scale.x;
        if (g.userData.blip) g.userData.blip.position.set(Math.cos(t * 1.6) * 0.55, 0, Math.sin(t * 1.6) * 0.55);
        if (g.userData.spinner) g.userData.spinner.rotation.z = t * 1.2 * dt;
    });

    // camera: eased focus target + parallax offset
    parallax.lerp(parallaxTarget, 0.06);
    const desired = camTarget.clone();
    desired.x += parallax.x * 0.7;
    desired.y += parallax.y * 0.5;
    camera.position.lerp(desired, 0.05);
    const look = lookTarget.clone();
    camera.lookAt(look);

    updateHover();
    renderer.render(scene, camera);
}

/* ============================================================
   3. CLOCK + BOOT + INIT
   ============================================================ */
function tickClocks() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const full = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const c1 = document.getElementById('clock');
    const c2 = document.getElementById('phoneClock');
    if (c1) c1.textContent = `${full}  ${time}`;
    if (c2) c2.textContent = time;
}

function runBoot(onDone) {
    const boot = document.querySelector('.boot');
    const fill = document.querySelector('.boot-fill');
    const status = document.querySelector('.boot-status');
    const steps = [
        'initializing ZoomiOS…',
        'mounting business modules…',
        'audit · gov · margin · rent',
        'rendering spatial shell…',
    ];
    // hide() is the source of truth — removing 'booting' lets CSS hide the
    // cover. Driven by setTimeout (not the rAF ticker) so a background-tab
    // load can never leave the cover stuck on screen.
    let done = false;
    const hide = () => {
        if (done) return;
        done = true;
        root.classList.remove('booting');
        boot.style.display = 'none';
        onDone();
    };

    if (REDUCED) { hide(); return; }

    // status text + progress fill are cosmetic enhancements
    steps.forEach((s, i) => setTimeout(() => { if (!done) status.textContent = s; }, i * 420));
    gsap.fromTo(fill, { width: '0%' }, { width: '100%', duration: 1.7, ease: 'power1.inOut' });

    // graceful fade if the ticker is alive; hard fallback regardless
    setTimeout(() => {
        gsap.to(boot, { autoAlpha: 0, duration: 0.45, ease: 'power2.inOut', onComplete: hide });
        setTimeout(hide, 800);
    }, 1900);
}

function revealOS() {
    if (REDUCED) return;
    const targets = IS_MOBILE
        ? ['.app-tile', '.phone-hero > *']
        : ['.desk-icon', '.dock-app', '.stage-hint > *'];

    // Reveals "pop in place" (scale + opacity) rather than sliding in from
    // outside their container, so any mid-animation frame still looks correct.
    if (IS_MOBILE) {
        gsap.from('.app-tile', { scale: 0.8, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'back.out(1.6)', transformOrigin: 'center' });
        gsap.from('.phone-hero > *', { y: 16, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power2.out' });
    } else {
        gsap.from('.desk-icon', { scale: 0.7, opacity: 0, stagger: 0.06, duration: 0.45, ease: 'back.out(1.7)', transformOrigin: 'center', delay: 0.05 });
        gsap.from('.dock-app', { scale: 0.5, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'back.out(2)', transformOrigin: 'center bottom', delay: 0.1 });
        gsap.from('.stage-hint > *', { y: 14, opacity: 0, stagger: 0.1, duration: 0.6, ease: 'power2.out', delay: 0.25 });
        gsap.from(camera.position, { z: 16, duration: 1.4, ease: 'power3.out' });
    }

    // Safety net: if the rAF ticker stalls (e.g. background-tab load), these
    // .from() tweens could strand elements mid-transform. Force the natural
    // resting state once the animations would have finished, regardless.
    setTimeout(() => gsap.set(targets, { clearProps: 'transform,opacity' }), 1500);
}

function boot() {
    if (IS_MOBILE) buildMobileUI(); else buildDesktopUI();
    initThree();
    tickClocks();
    setInterval(tickClocks, 15000);
    animate();

    // signal success: stop the safety timeout, mark ready
    if (window.__zoomiBootTimeout) clearTimeout(window.__zoomiBootTimeout);
    root.classList.add('js-ready');

    runBoot(revealOS);

    // Esc closes top window/sheet
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const openSheetEl = document.querySelector('.sheet.open');
        if (openSheetEl) { closeSheet(openSheetEl.dataset.id); return; }
        const openWin = [...document.querySelectorAll('.window.open')].pop();
        if (openWin) closeWindow(openWin.dataset.id);
    });
}

try {
    boot();
} catch (err) {
    console.error('ZoomiOS failed to start:', err);
    if (window.__zoomiBootTimeout) clearTimeout(window.__zoomiBootTimeout);
    root.classList.remove('js', 'booting');
    root.classList.add('js-failed');
}

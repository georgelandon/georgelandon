(() => {
  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  // Active nav link (multi-page)
  try {
    const current = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav a[data-nav]").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === current) a.classList.add("active");
    });
  } catch (e) {}


  // Mobile nav toggle
  const toggleBtn = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".nav");
  const setExpanded = (v) => toggleBtn?.setAttribute("aria-expanded", v ? "true" : "false");

  const closeNav = () => {
    document.body.classList.remove("nav-open");
    setExpanded(false);
  };

  if (toggleBtn && nav) {
    toggleBtn.addEventListener("click", () => {
      const open = !document.body.classList.contains("nav-open");
      document.body.classList.toggle("nav-open", open);
      setExpanded(open);
    });

    // Close menu when clicking a nav link (mobile)
    nav.addEventListener("click", (e) => {
      const a = e.target?.closest?.("a");
      if (!a) return;
      if (document.body.classList.contains("nav-open")) closeNav();
    });

    // Close on Escape
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeNav();
    });

    // Close if resizing to desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth > 860) closeNav();
    }, { passive: true });
  }

  // Cursor glow (mouse + touch)
  const glow = document.getElementById("cursorGlow");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let gx = 0.5, gy = 0.28; // normalized (0..1)
  const setGlow = () => {
    if (!glow) return;
    glow.style.setProperty("--gx", `${(gx * 100).toFixed(2)}%`);
    glow.style.setProperty("--gy", `${(gy * 100).toFixed(2)}%`);
  };
  setGlow();

  const updatePointer = (clientX, clientY) => {
    gx = Math.min(1, Math.max(0, clientX / window.innerWidth));
    gy = Math.min(1, Math.max(0, clientY / window.innerHeight));
    setGlow();
  };

  if (!prefersReducedMotion) {
    window.addEventListener("pointermove", (e) => updatePointer(e.clientX, e.clientY), { passive: true });
    window.addEventListener("touchmove", (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      updatePointer(t.clientX, t.clientY);
    }, { passive: true });
  }

  
// Starfield (idle random drift → follows cursor/touch after first interaction)
const canvas = document.getElementById("starfield");
const ctx = canvas?.getContext("2d", { alpha: true });
if (!canvas || !ctx) return;

// Allow manual override: add ?motion=1 to force animation (useful for debugging).
const forceMotion = new URLSearchParams(location.search).get("motion") === "1";
const prefersReducedMotion = !forceMotion && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let w = 0, h = 0;
let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
let stars = [];
let rafId = null;

const rand = (min, max) => min + Math.random() * (max - min);
const STAR_COUNT = () => {
  const area = window.innerWidth * window.innerHeight;
  return Math.max(140, Math.min(600, Math.floor(area / 3200)));
};

const seedStars = () => {
  const n = STAR_COUNT();
  stars = new Array(n).fill(0).map(() => {
    const depth = rand(0.18, 1.0);
    const radius = rand(0.55, 1.8) * depth;
    const ang = rand(0, Math.PI * 2);
    return {
      x: rand(0, w),
      y: rand(0, h),
      r: radius,
      d: depth,
      tw: rand(0, Math.PI * 2),
      // random-walk drift
      ang,
      turn: rand(-0.25, 0.25) * (0.25 + depth), // radians/sec
      spd: rand(3.0, 16.0) * depth,             // px/sec
    };
  });
};

const resize = () => {
  w = Math.floor(window.innerWidth);
  h = Math.floor(window.innerHeight);
  dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedStars();
};

// Pointer handling: idle until first pointer movement, then follow.
let hasPointer = false;
let gx2 = 0.5, gy2 = 0.28; // local normalized pointer
let px = 0.5, py = 0.28;   // smoothed parallax center

const notePointer = (clientX, clientY) => {
  hasPointer = true;
  gx2 = Math.min(1, Math.max(0, clientX / window.innerWidth));
  gy2 = Math.min(1, Math.max(0, clientY / window.innerHeight));
};

// Idle “wander” center (pseudo-random but stable)
const idle = {
  p1: rand(0, Math.PI * 2),
  p2: rand(0, Math.PI * 2),
  p3: rand(0, Math.PI * 2),
  p4: rand(0, Math.PI * 2),
};
const idleTarget = (t) => {
  const x =
    0.5 +
    0.07 * Math.sin(t * 0.00019 + idle.p1) +
    0.03 * Math.sin(t * 0.00007 + idle.p2);
  const y =
    0.28 +
    0.06 * Math.sin(t * 0.00017 + idle.p3) +
    0.03 * Math.sin(t * 0.00006 + idle.p4);
  return { x, y };
};

// Smooth follow
const smooth = (cur, tgt, dt) => cur + (tgt - cur) * (1 - Math.pow(0.001, dt));

if (!prefersReducedMotion) {
  window.addEventListener("pointermove", (e) => notePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener("pointerdown", (e) => notePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener("mousemove", (e) => notePointer(e.clientX, e.clientY), { passive: true }); // fallback

  window.addEventListener("touchstart", (e) => {
    const t = e.touches && e.touches[0];
    if (t) notePointer(t.clientX, t.clientY);
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    const t = e.touches && e.touches[0];
    if (t) notePointer(t.clientX, t.clientY);
  }, { passive: true });
}

let last = performance.now();
const animate = (now) => {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  ctx.clearRect(0, 0, w, h);

  // Choose parallax center: idle until pointer moves
  const tgt = hasPointer ? { x: gx2, y: gy2 } : idleTarget(now);
  px = smooth(px, tgt.x, dt);
  py = smooth(py, tgt.y, dt);

  // Parallax strength (noticeable but still subtle)
  const ox = (px - 0.5) * 42;
  const oy = (py - 0.5) * 32;
  const fx = px * w;
  const fy = py * h;

  for (let i = 0; i < stars.length; i++) {
    const st = stars[i];

    // random-walk drift
    st.ang += st.turn * dt;
    st.x += Math.cos(st.ang) * st.spd * dt;
    st.y += Math.sin(st.ang) * st.spd * dt;

    // wrap
    const m = 16;
    if (st.x < -m) st.x = w + m;
    if (st.x > w + m) st.x = -m;
    if (st.y < -m) st.y = h + m;
    if (st.y > h + m) st.y = -m;

    // twinkle
    st.tw += dt * (0.7 + st.d * 1.9);
    const twk = 0.55 + 0.45 * Math.sin(st.tw);

    // parallax (stronger for near stars)
    const x = st.x + ox * st.d;
    const y = st.y + oy * st.d;

    // subtle focus boost near pointer
    const dx = x - fx;
    const dy = y - fy;
    const focus = Math.exp(-(dx * dx + dy * dy) / (2 * 280 * 280));

    const a = (0.10 + 0.55 * st.d) * twk * (1 + 0.22 * focus * st.d);

    // neutral-white with tiny temp variance
    const cool = 235 + Math.floor(14 * (1 - st.d));
    const warm = 235 + Math.floor(18 * st.d);
    ctx.fillStyle = `rgba(${warm},${warm},${cool},${a.toFixed(4)})`;

    ctx.beginPath();
    ctx.arc(x, y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }

  rafId = requestAnimationFrame(animate);
};

const renderStatic = () => {
  ctx.clearRect(0, 0, w, h);
  for (const st of stars) {
    ctx.fillStyle = "rgba(245,245,255,0.35)";
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const start = () => {
  if (rafId) cancelAnimationFrame(rafId);
  last = performance.now();
  if (prefersReducedMotion) {
    renderStatic();
    return;
  }
  rafId = requestAnimationFrame(animate);
};

window.addEventListener("resize", () => {
  resize();
  start();
}, { passive: true });

resize();
start();

})();

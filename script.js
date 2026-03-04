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

  // Starfield
  const canvas = document.getElementById("starfield");
  const ctx = canvas?.getContext("2d", { alpha: true });
  if (!canvas || !ctx) return;

  let w = 0, h = 0;
  let dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  let stars = [];
  let rafId = null;

  const STAR_COUNT = () => {
    const area = window.innerWidth * window.innerHeight;
    return Math.max(120, Math.min(540, Math.floor(area / 3400)));
  };

  const rand = (min, max) => min + Math.random() * (max - min);

  const seedStars = () => {
    const n = STAR_COUNT();
    stars = new Array(n).fill(0).map(() => {
      const depth = rand(0.15, 1.0);         // 0.15 (far) -> 1.0 (near)
      const radius = rand(0.55, 1.75) * depth;
      return {
        x: rand(0, w),
        y: rand(0, h),
        r: radius,
        d: depth,
        tw: rand(0, Math.PI * 2),
        sp: rand(0.02, 0.09) * (0.6 + depth),
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

  // Pointer for parallax and a very subtle “focus” effect
  let px = 0.5, py = 0.28;
  const syncPointer = () => { px = gx; py = gy; };

  let last = performance.now();
  const animate = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    ctx.clearRect(0, 0, w, h);

    syncPointer();
    const ox = (px - 0.5) * 18;
    const oy = (py - 0.5) * 14;

    // Focus center in pixels
    const fx = px * w;
    const fy = py * h;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      // drift + wrap
      s.x += s.sp * 18 * dt;
      s.y += s.sp * 10 * dt;
      if (s.x > w + 12) s.x = -12;
      if (s.y > h + 12) s.y = -12;

      // twinkle
      s.tw += dt * (0.8 + s.d * 1.8);
      const twk = 0.55 + 0.45 * Math.sin(s.tw);

      // parallax
      const x = s.x + ox * s.d;
      const y = s.y + oy * s.d;

      // subtle brightness boost near pointer, stronger for near stars
      const dx = x - fx;
      const dy = y - fy;
      const dist2 = dx * dx + dy * dy;
      const focus = Math.exp(-dist2 / (2 * 260 * 260)); // ~260px sigma

      const a = (0.11 + 0.55 * s.d) * twk * (1 + 0.25 * focus * s.d);

      // tiny color temperature variance
      const cool = 235 + Math.floor(15 * (1 - s.d));
      const warm = 235 + Math.floor(20 * s.d);
      ctx.fillStyle = `rgba(${warm},${warm},${cool},${a.toFixed(4)})`;

      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    rafId = requestAnimationFrame(animate);
  };

  const renderStatic = () => {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      ctx.fillStyle = "rgba(245,245,255,0.35)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
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

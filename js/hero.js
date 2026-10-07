/* DKE King Beetle · hero and floating navigation.
 *
 * The hero's stage is pinned to the screen and stacks two pictures; the top one only shows
 * through a soft spotlight that trails the pointer (a CSS mask placed with --mx / --my, see
 * css/hero.css). On touch screens, where nothing hovers, the light drifts by itself and
 * follows a finger. Scrolling dollies into the pictures; once the shop scrolls up, the stage
 * rests as a softly blurred backdrop behind it.
 *
 * Also runs the top bar's one control: the search button jumps to the shop's search box.
 */
(function () {
  'use strict';

  const hero = document.getElementById('hero');
  const stage = document.getElementById('heroStage');
  const light = document.getElementById('heroReveal');
  const nav = document.getElementById('siteNav');
  if (!hero || !stage || !light || !nav) return;

  const root = document.documentElement;
  const title = document.getElementById('heroTitle');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hovers = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- tuning ---------- */
  const TRAIL = 0.1; // share of the remaining gap the light closes per 60 Hz frame
  const TOUCH_HOLD_MS = 2600; // how long the light stays where a finger left it before drifting on
  const ZOOM_SPAN = 0.7; // screen heights of scrolling that drive the dolly (the hero is 1.7 tall)
  const ZOOM_DEPTH = 0.85; // how much the pictures grow by the end of it
  const ZOOM_ORIGIN = { x: 0.5, y: 0.55 }; // matches transform-origin of .lh-zoom
  const ZOOMED_AT = 0.12; // screen heights scrolled before the notes and button step aside
  const BACKDROP_AT = 0.82; // ...and before the stage becomes a still, blurred backdrop
  const REVEAL_TIMEOUT_MS = 4000; // never hold the entrance hostage to a slow picture or catalog
  const LONG_TITLE = 18; // characters; a longer page name is set smaller
  const THAI = /[฀-๿]/;

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const smooth = (t) => t * t * (3 - 2 * t);

  /* ================================================================ stage */

  const pointer = { x: 0, y: 0, seen: false, touchedAt: -Infinity }; // screen coordinates
  const spot = { x: -999, y: -999 }; // stage coordinates before the zoom, as written to --mx / --my
  const zoom = { progress: 0, scale: 1 };
  let backdrop = false;
  let zoomed = false;
  let queued = false;
  let lastFrame = 0;

  /** Past the hero the stage is a backdrop; a little way in, the notes and button step aside. */
  function updateMode() {
    const screen = stage.clientHeight || window.innerHeight;
    const nextBackdrop = window.scrollY > screen * BACKDROP_AT;
    if (nextBackdrop !== backdrop) {
      backdrop = nextBackdrop;
      root.classList.toggle('is-backdrop', backdrop);
    }
    const nextZoomed = window.scrollY > screen * ZOOMED_AT;
    if (nextZoomed !== zoomed) {
      zoomed = nextZoomed;
      root.classList.toggle('is-zoomed', zoomed);
    }
  }

  /** Where the light is heading (stage coordinates before the zoom), or null with nothing to follow. */
  function lightGoal(now, width, height) {
    if (!hovers && !reduceMotion && now - pointer.touchedAt > TOUCH_HOLD_MS) {
      const t = now / 1000;
      return {
        x: width * (0.5 + 0.3 * Math.sin(t * 0.31)),
        y: height * (0.56 + 0.2 * Math.sin(t * 0.43 + 1.3)),
        drifting: true,
      };
    }
    if (!pointer.seen) return null;
    // The pictures are scaled about ZOOM_ORIGIN: undo that, so the light stays under the pointer.
    const ox = width * ZOOM_ORIGIN.x;
    const oy = height * ZOOM_ORIGIN.y;
    return {
      x: ox + (pointer.x - ox) / zoom.scale,
      y: oy + (pointer.y - oy) / zoom.scale,
      drifting: false,
    };
  }

  function frame(now) {
    queued = false;
    if (document.hidden || root.classList.contains('is-locked')) {
      lastFrame = 0;
      return;
    }
    const elapsed = lastFrame ? Math.min(64, now - lastFrame) : 16.7;
    lastFrame = now;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    let moving = false;

    // Dolly: ease toward where the scroll position says the camera should be.
    const wanted = reduceMotion ? 0 : clamp(window.scrollY / (height * ZOOM_SPAN), 0, 1);
    if (zoom.progress !== wanted) {
      zoom.progress += (wanted - zoom.progress) * Math.min(1, (elapsed / 1000) * 4.5);
      if (Math.abs(wanted - zoom.progress) < 0.0005) zoom.progress = wanted;
      else moving = true;
      zoom.scale = 1 + smooth(zoom.progress) * ZOOM_DEPTH;
      stage.style.setProperty('--zs', zoom.scale.toFixed(4));
      stage.style.setProperty('--zp', zoom.progress.toFixed(4));
    }

    // As a blurred backdrop the stage holds still once the dolly has arrived: a static blurred
    // layer costs nothing, a moving one is blurred again every frame.
    const to = backdrop ? null : lightGoal(now, width, height);
    if (to) {
      const share = 1 - Math.pow(1 - TRAIL, elapsed / 16.7);
      spot.x += (to.x - spot.x) * share;
      spot.y += (to.y - spot.y) * share;
      light.style.setProperty('--mx', `${spot.x.toFixed(1)}px`);
      light.style.setProperty('--my', `${spot.y.toFixed(1)}px`);
      if (to.drifting || Math.abs(to.x - spot.x) > 0.3 || Math.abs(to.y - spot.y) > 0.3) moving = true;
    }

    if (moving) wake();
    else lastFrame = 0;
  }

  function wake() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  }

  function follow(event) {
    if (event.pointerType === 'touch') {
      if (!stage.contains(event.target)) return;
      pointer.touchedAt = performance.now();
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    wake();
  }
  window.addEventListener('pointermove', follow, { passive: true });
  window.addEventListener('pointerdown', follow, { passive: true });
  document.addEventListener('visibilitychange', wake);
  const productDialog = document.getElementById('productDialog');
  if (productDialog) productDialog.addEventListener('close', wake);

  /* ================================================================ title */

  /**
   * The title is the Facebook page name (shop.js writes it as plain text). Wrap it in a span
   * so it can rise in on its own, and mark Thai names, which are set upright and looser.
   */
  function dressTitle() {
    if (!title) return;
    const first = title.firstChild;
    if (title.childNodes.length === 1 && first.nodeType === Node.ELEMENT_NODE) return; // already dressed
    const text = title.textContent.trim();
    const name = document.createElement('span');
    name.className = 'lh-name lh-rise';
    name.textContent = text;
    name.classList.toggle('lh-thai', THAI.test(text));
    title.replaceChildren(name);
    title.classList.toggle('is-long', text.length > LONG_TITLE);
  }

  if (title) {
    dressTitle();
    // shop.js rewrites the title when the catalog arrives; a dressed title is left alone.
    new MutationObserver(dressTitle).observe(title, { childList: true });
  }

  /* ============================================================= entrance */

  // Wait for the picture, the catalog (it carries the page name) and the fonts, so the
  // entrance plays once, on the final text.
  const ready = [
    new Promise((resolve) => {
      const picture = new Image();
      picture.onload = resolve;
      picture.onerror = resolve;
      picture.src = 'assets/hero-base.webp';
    }),
    new Promise((resolve) => {
      if (window.EBShopCatalog) resolve();
      document.addEventListener('eb:catalog', resolve, { once: true });
      document.addEventListener('eb:catalog-error', resolve, { once: true });
    }),
  ];
  if (document.fonts && document.fonts.ready) ready.push(document.fonts.ready.catch(() => {}));

  let revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    root.classList.add('is-revealed');
    wake();
  }
  Promise.all(ready).then(reveal);
  setTimeout(reveal, REVEAL_TIMEOUT_MS);

  /* =============================================================== top bar */

  const shop = document.getElementById('shop');
  const query = document.getElementById('q');

  // The one control up here: bring the shop into view with the cursor in its search box.
  nav.addEventListener('click', (event) => {
    if (!event.target.closest('[data-nav-search]')) return;
    if (shop) shop.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (query) query.focus({ preventScroll: true });
  });

  function onScroll() {
    updateMode();
    // The bar gets its backing once the shop reaches it.
    nav.classList.toggle('is-scrolled', window.scrollY > hero.offsetHeight - nav.offsetHeight - 8);
    wake();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();

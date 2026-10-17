// Concept art browser. Reads data.json (written by tools/build.py).
// Home is a grid of groups; a group is a full-screen, scroll-snapped reel of its renders.
(() => {
  const app = document.getElementById("app");
  const drawer = document.getElementById("drawer");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let data = null;
  let reel = null; // { el, slides, observer, raf, shots }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const em = (s) => esc(s).replace(/\*(.+?)\*/g, "<em>$1</em>");
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const pad = (n) => String(n).padStart(2, "0");
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const byId = (group, id) => group.images.find((i) => i.id === id);

  function copyButton(text, label = "Copy", cls = "copy") {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = label;
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Copy failed";
      }
      setTimeout(() => (b.textContent = label), 1400);
    });
    return b;
  }

  // ---------- Home ----------

  function home() {
    document.title = "Assembly Line Chaos — Concept Art";
    const cards = data.groups.map((g) => {
      const cover = byId(g, g.cover);
      const art = cover
        ? `<img class="cover" src="${cover.thumb}" alt="" loading="lazy">`
        : `<div class="empty">No renders yet</div>`;
      return `<a class="card" href="#group/${esc(g.slug)}">${art}
        <div class="body">
          <h2>${esc(g.name)}</h2>
          <div class="count">${plural(g.images.length, "render")}${g.style && g.style.name !== g.name ? ` · ${esc(g.style.name)}` : ""}</div>
          ${g.style ? `<p>${esc(g.style.block)}</p>` : ""}
        </div></a>`;
    });
    app.innerHTML = `<h1>Concept art</h1>
      <p class="muted">Style explorations for Assembly Line Chaos. Pick a group to scroll through its renders.</p>
      <div class="groups">${cards.join("") || '<p class="none">Nothing here yet.</p>'}</div>`;
    window.scrollTo(0, 0);
  }

  // ---------- Group reel ----------

  function orderedImages(group) {
    return [...group.prompts.flatMap((pid) => group.images.filter((i) => i.prompt === pid)),
            ...group.images.filter((i) => !i.prompt)];
  }

  function groupView(groupSlug) {
    const group = data.groups.find((g) => g.slug === groupSlug);
    if (!group) return home();
    document.title = `${group.name} — Concept Art`;
    document.body.classList.add("immersive");

    const shots = orderedImages(group);
    const cover = byId(group, group.cover) || shots[0];
    const style = group.style;
    const others = data.groups.filter((g) => g !== group);
    const next = others.length ? data.groups[(data.groups.indexOf(group) + 1) % data.groups.length] : null;
    const unrendered = group.prompts.filter((pid) => !group.images.some((i) => i.prompt === pid));

    const hero = `<section class="slide hero" data-label="${esc(group.name)}">
        ${cover ? `<img class="art" src="${cover.thumb}" data-full="${cover.full}" alt="">` : ""}
        <div class="shade"></div>
        <div class="hero-text">
          <div class="eyebrow">${plural(shots.length, "render")}${style && style.name !== group.name ? ` · ${esc(style.name)}` : ""}</div>
          <h1>${esc(group.name)}</h1>
          ${style ? `<blockquote>${esc(style.block)}</blockquote>` : ""}
          ${style && style.intent ? `<p class="intent">${em(style.intent)}</p>` : ""}
          <div class="hero-actions"></div>
        </div>
        ${shots.length ? `<div class="cue" aria-hidden="true">Scroll<span></span></div>` : ""}
      </section>`;

    const slides = shots.map((img, i) => {
      const p = img.prompt ? data.prompts[img.prompt] : null;
      const tags = p ? [p.subject, p.ratio].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("") : "";
      return `<section class="slide shot" data-index="${i}" data-label="${esc(p ? p.label : "Render")}">
          <div class="blur" style="background-image:url('${img.thumb}')"></div>
          <img class="art" src="${img.thumb}" data-full="${img.full}" alt="${esc(p ? p.label : "Render")}" width="${img.w}" height="${img.h}">
          <div class="shade"></div>
          <div class="caption">
            <div class="num">${pad(i + 1)} <span>/ ${pad(shots.length)}</span></div>
            <h2>${esc(p ? p.label : "Render")}</h2>
            <div class="tags">${tags}</div>
            <div class="actions">
              <button class="ghost" data-act="prompt">Prompt</button>
              <button class="ghost" data-act="fit">Fit</button>
              <a class="ghost" data-act="download" href="${img.full}">Download</a>
            </div>
          </div>
        </section>`;
    });

    const outro = `<section class="slide outro" data-label="More">
        <div class="outro-inner">
          ${unrendered.length ? `<h3>Not rendered yet</h3><ul class="pending">${unrendered.map((pid) =>
            `<li><span>${esc(data.prompts[pid].label)}</span></li>`).join("")}</ul>` : ""}
          ${next ? `<a class="next" href="#group/${esc(next.slug)}">
              ${byId(next, next.cover) ? `<img src="${byId(next, next.cover).thumb}" alt="">` : ""}
              <span class="next-label">Next concept</span><span class="next-name">${esc(next.name)}</span></a>` : ""}
          <a class="back" href="#">← All concepts</a>
        </div>
      </section>`;

    app.innerHTML = `<div class="reel" tabindex="-1">${hero}${slides.join("")}${outro}</div>
      <a class="reel-back" href="#">← All concepts</a>
      <nav class="dots" aria-label="Renders"></nav>`;

    const el = app.querySelector(".reel");
    const sectionEls = [...el.querySelectorAll(".slide")];

    // Hero actions and per-shot buttons.
    if (style) app.querySelector(".hero-actions").appendChild(copyButton(style.block, "Copy style block", "ghost"));
    sectionEls.filter((s) => s.classList.contains("shot")).forEach((s) => {
      const i = Number(s.dataset.index);
      const img = shots[i];
      const p = img.prompt ? data.prompts[img.prompt] : null;
      s.querySelector('[data-act="prompt"]').addEventListener("click", () => openDrawer(group, img, i, shots.length));
      s.querySelector('[data-act="fit"]').addEventListener("click", (e) => {
        s.classList.toggle("fit");
        e.currentTarget.textContent = s.classList.contains("fit") ? "Fill" : "Fit";
      });
      const n = shots.filter((x) => x.prompt === img.prompt).indexOf(img) + 1;
      s.querySelector('[data-act="download"]').download =
        `${group.slug}-${slug(p ? p.label : "render")}-${n}${img.full.slice(img.full.lastIndexOf("."))}`;
      s.querySelector(".art").addEventListener("click", () => s.classList.toggle("bare"));
    });

    // Navigation dots.
    const dots = app.querySelector(".dots");
    sectionEls.forEach((s, i) => {
      const d = document.createElement("button");
      d.setAttribute("aria-label", s.dataset.label);
      d.title = s.dataset.label;
      d.addEventListener("click", () => goTo(i));
      dots.appendChild(d);
    });

    // Reveal on enter, swap thumbs for full images when close.
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = e.target;
        if (e.isIntersecting) {
          loadFull(s);
          const idx = sectionEls.indexOf(s);
          loadFull(sectionEls[idx + 1]);
        }
        if (e.intersectionRatio >= 0.55) {
          s.classList.add("in");
          setCurrent(sectionEls.indexOf(s));
        }
      }
    }, { root: el, threshold: [0, 0.55] });
    sectionEls.forEach((s) => observer.observe(s));

    reel = { el, slides: sectionEls, observer, raf: 0, current: 0 };
    if (!reduceMotion) el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    el.focus({ preventScroll: true });
  }

  function loadFull(section) {
    if (!section) return;
    const img = section.querySelector(".art[data-full]");
    if (!img || img.dataset.loaded) return;
    img.dataset.loaded = "1";
    const full = new Image();
    full.onload = () => { img.src = full.src; };
    full.src = img.dataset.full;
  }

  function setCurrent(i) {
    if (!reel) return;
    reel.current = i;
    reel.slides.forEach((s, j) => s.classList.toggle("current", j === i));
    app.querySelectorAll(".dots button").forEach((d, j) => d.classList.toggle("on", j === i));
    document.body.classList.toggle("past-hero", i > 0);
  }

  // Parallax: each slide's art drifts against the scroll and settles at rest.
  function onScroll() {
    if (!reel || reel.raf) return;
    reel.raf = requestAnimationFrame(() => {
      reel.raf = 0;
      const h = reel.el.clientHeight;
      const top = reel.el.scrollTop;
      for (const s of reel.slides) {
        const p = Math.max(-1, Math.min(1, (s.offsetTop - top) / h));
        s.style.setProperty("--p", p.toFixed(4));
      }
    });
  }

  function goTo(i) {
    if (!reel) return;
    const target = reel.slides[Math.max(0, Math.min(reel.slides.length - 1, i))];
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }

  function leaveReel() {
    if (!reel) return;
    reel.observer.disconnect();
    cancelAnimationFrame(reel.raf);
    reel = null;
    document.body.classList.remove("immersive", "past-hero");
    closeDrawer();
  }

  // ---------- Prompt drawer ----------

  function openDrawer(group, img, i, total) {
    const p = img.prompt ? data.prompts[img.prompt] : null;
    document.getElementById("dr-title").textContent = p ? p.label : "Render";
    document.getElementById("dr-meta").textContent = [
      `${pad(i + 1)} / ${pad(total)}`, p && p.subject, `${img.w} × ${img.h}`,
      img.seed != null && `seed ${img.seed}`, img.steps && `${img.steps} steps`,
    ].filter(Boolean).join(" · ");
    const text = p ? p.text : img.embedded || "No prompt recorded for this render.";
    document.getElementById("dr-text").textContent = text;
    const actions = document.getElementById("dr-actions");
    actions.replaceChildren();
    if (p || img.embedded) actions.appendChild(copyButton(text, "Copy prompt", "ghost"));
    if (group.style) actions.appendChild(copyButton(group.style.block, "Copy style block", "ghost"));
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }

  drawer.querySelector(".dr-close").addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (!reel || e.target.closest("input, textarea")) return;
    const k = e.key;
    if (k === "Escape") return drawer.classList.contains("open") ? closeDrawer() : (location.hash = "");
    if (["ArrowDown", "PageDown", "j", " "].includes(k)) { e.preventDefault(); goTo(reel.current + 1); }
    if (["ArrowUp", "PageUp", "k"].includes(k)) { e.preventDefault(); goTo(reel.current - 1); }
    if (k === "Home") { e.preventDefault(); goTo(0); }
    if (k === "End") { e.preventDefault(); goTo(reel.slides.length - 1); }
    const s = reel.slides[reel.current];
    if (k === "p" && s.classList.contains("shot")) s.querySelector('[data-act="prompt"]').click();
    if (k === "f" && s.classList.contains("shot")) s.querySelector('[data-act="fit"]').click();
  });

  // ---------- Routing ----------

  function route() {
    if (!data) return;
    leaveReel();
    const m = location.hash.match(/^#group\/(.+)$/);
    m ? groupView(decodeURIComponent(m[1])) : home();
  }

  window.addEventListener("hashchange", route);
  fetch("data.json")
    .then((r) => r.json())
    .then((d) => { data = d; route(); })
    .catch(() => { app.innerHTML = '<p class="none">Couldn\'t load data.json. Run tools/build.py and serve _site/.</p>'; });
})();

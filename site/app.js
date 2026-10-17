// Concept art browser. Reads data.json (written by tools/build.py) and renders groups of renders.
(() => {
  const app = document.getElementById("app");
  const box = document.getElementById("lightbox");
  let data = null;
  let viewing = { list: [], index: 0, group: null };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const byId = (group, id) => group.images.find((i) => i.id === id);

  function copyButton(text, label = "Copy") {
    const b = document.createElement("button");
    b.className = "copy";
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
      <p class="muted">Style explorations for Assembly Line Chaos. Pick a group to see its style and the renders made from each prompt.</p>
      <div class="groups">${cards.join("") || '<p class="none">Nothing here yet.</p>'}</div>`;
  }

  function renderGrid(group, images, container) {
    const grid = document.createElement("div");
    grid.className = "renders";
    for (const img of images) {
      const b = document.createElement("button");
      b.setAttribute("aria-label", "Open render");
      b.style.setProperty("--ar", `${img.w} / ${img.h}`);
      b.innerHTML = `<img src="${img.thumb}" alt="" loading="lazy" width="${img.w}" height="${img.h}">`;
      b.addEventListener("click", () => openBox(group, img.id));
      grid.appendChild(b);
    }
    container.appendChild(grid);
  }

  function groupView(slug) {
    const group = data.groups.find((g) => g.slug === slug);
    if (!group) return home();
    document.title = `${group.name} — Concept Art`;
    app.innerHTML = `<a class="crumb" href="#">← All groups</a>
      <h1>${esc(group.name)}</h1>
      <div class="muted">${plural(group.images.length, "render")}${group.style && group.style.name !== group.name ? ` · style: ${esc(group.style.name)}` : ""}</div>`;

    if (group.style) {
      const s = document.createElement("section");
      s.className = "style-block";
      s.innerHTML = `<div class="label">Style block</div><blockquote>${esc(group.style.block)}</blockquote>`;
      s.appendChild(copyButton(group.style.block, "Copy style block"));
      if (group.style.intent) {
        const intent = esc(group.style.intent).replace(/\*(.+?)\*/g, "<em>$1</em>");
        s.insertAdjacentHTML("beforeend", `<p class="intent muted">${intent}</p>`);
      }
      app.appendChild(s);
    }

    for (const pid of group.prompts) {
      const p = data.prompts[pid];
      const images = group.images.filter((i) => i.prompt === pid);
      const sec = document.createElement("section");
      sec.className = "prompt";
      sec.innerHTML = `<div class="prompt-head">
          <h2>${esc(p.label)}</h2>
          ${p.subject ? `<span class="tag">${esc(p.subject)}</span>` : ""}
          ${p.ratio ? `<span class="tag">${esc(p.ratio)}</span>` : ""}
        </div>
        <details class="text"><summary>Prompt</summary><pre>${esc(p.text)}</pre></details>`;
      sec.querySelector("details").appendChild(copyButton(p.text, "Copy prompt"));
      if (images.length) renderGrid(group, images, sec);
      else sec.insertAdjacentHTML("beforeend", `<p class="none">Not rendered yet.</p>`);
      app.appendChild(sec);
    }

    const other = group.images.filter((i) => !i.prompt);
    if (other.length) {
      const sec = document.createElement("section");
      sec.className = "prompt";
      sec.innerHTML = `<div class="prompt-head"><h2>Other renders</h2></div>
        <p class="muted">Not made from a prompt saved in this repo.</p>`;
      renderGrid(group, other, sec);
      app.appendChild(sec);
    }
    window.scrollTo(0, 0);
  }

  // Lightbox: steps through the group's renders in page order.
  function openBox(group, id) {
    const order = [...group.prompts.flatMap((pid) => group.images.filter((i) => i.prompt === pid)),
                   ...group.images.filter((i) => !i.prompt)];
    viewing = { list: order, index: Math.max(0, order.findIndex((i) => i.id === id)), group };
    showBox();
    if (!box.open) box.showModal();
  }

  function showBox() {
    const { list, index, group } = viewing;
    const img = list[index];
    const p = img.prompt ? data.prompts[img.prompt] : null;
    const sameLabel = list.filter((i) => i.prompt === img.prompt);
    const n = sameLabel.indexOf(img) + 1;
    const title = p ? p.label : "Render";
    document.getElementById("lb-img").src = img.full;
    document.getElementById("lb-title").textContent = sameLabel.length > 1 ? `${title} · ${n}` : title;
    const meta = [group.name, `${img.w} × ${img.h}`, img.seed != null && `seed ${img.seed}`, img.steps && `${img.steps} steps`]
      .filter(Boolean).join(" · ");
    document.getElementById("lb-meta").textContent = meta;
    const promptBox = document.getElementById("lb-prompt");
    const text = p ? p.text : img.embedded;
    promptBox.innerHTML = text ? `<pre>${esc(text)}</pre>` : "";
    if (text) promptBox.appendChild(copyButton(text, "Copy prompt"));
    const dl = document.getElementById("lb-download");
    dl.href = img.full;
    const ext = img.full.slice(img.full.lastIndexOf("."));
    dl.download = `${group.slug}-${(p ? p.label : "render").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${n}${ext}`;
    box.querySelectorAll(".lb-nav").forEach((b) => (b.hidden = list.length < 2));
  }

  function step(delta) {
    viewing.index = (viewing.index + delta + viewing.list.length) % viewing.list.length;
    showBox();
  }

  box.querySelector(".lb-prev").addEventListener("click", () => step(-1));
  box.querySelector(".lb-next").addEventListener("click", () => step(1));
  box.querySelector(".lb-close").addEventListener("click", () => box.close());
  box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
  document.addEventListener("keydown", (e) => {
    if (!box.open) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });

  function route() {
    if (!data) return;
    if (box.open) box.close();
    const m = location.hash.match(/^#group\/(.+)$/);
    m ? groupView(decodeURIComponent(m[1])) : home();
  }

  window.addEventListener("hashchange", route);
  fetch("data.json")
    .then((r) => r.json())
    .then((d) => { data = d; route(); })
    .catch(() => { app.innerHTML = '<p class="none">Couldn\'t load data.json. Run tools/build.py and serve _site/.</p>'; });
})();

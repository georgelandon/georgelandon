(() => {
  const topicsRoot = document.getElementById('pubTopics');
  if (!topicsRoot) return; // only run on research.html

  const topicChipsRoot = document.getElementById('topicChips');
  const topicsListRoot = document.getElementById('topicsList');

  const searchEl = document.getElementById('pubSearch');
  const typeEl = document.getElementById('pubType');
  const yearEl = document.getElementById('pubYear');
  const statsEl = document.getElementById('pubStats');
  const collapseAllBtn = document.getElementById('collapseAll');
  const toastEl = document.getElementById('toast');

  const state = {
    query: '',
    type: 'all',
    year: 'all',
  };

  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    window.clearTimeout(toastEl._t);
    toastEl._t = window.setTimeout(() => toastEl.classList.remove('show'), 1500);
  };

  const clampText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // --- BibTeX parsing (small, dependency-free) ---
  // Parses @type{key, field = {value}, ...}
  const parseBibTeX = (text) => {
    const entries = [];
    const n = text.length;
    let i = 0;

    const skipWS = () => { while (i < n && /\s/.test(text[i])) i++; };

    const readUntil = (stopChars) => {
      const start = i;
      while (i < n && !stopChars.includes(text[i])) i++;
      return text.slice(start, i);
    };

    const readBalanced = (openChar, closeChar) => {
      let depth = 0;
      const start = i;
      while (i < n) {
        const c = text[i++];
        if (c === openChar) depth++;
        else if (c === closeChar) {
          depth--;
          if (depth === 0) break;
        }
      }
      return text.slice(start, i);
    };

    const splitTopLevel = (s) => {
      const parts = [];
      let buf = '';
      let depth = 0;
      let inQ = false;
      for (let k = 0; k < s.length; k++) {
        const c = s[k];
        if (c === '"' && s[k - 1] !== '\\') inQ = !inQ;
        if (!inQ) {
          if (c === '{') depth++;
          else if (c === '}') depth = Math.max(0, depth - 1);
        }
        if (c === ',' && depth === 0 && !inQ) {
          parts.push(buf);
          buf = '';
        } else {
          buf += c;
        }
      }
      if (buf.trim()) parts.push(buf);
      return parts;
    };

    const parseValue = (v) => {
      v = v.trim();
      if (!v) return '';
      if (v.endsWith(',')) v = v.slice(0, -1).trim();
      v = v.replace(/\s+#\s+/g, ' ');

      if (v.startsWith('{') && v.endsWith('}')) {
        v = v.slice(1, -1);
      } else if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      }
      return clampText(v);
    };

    while (i < n) {
      const at = text.indexOf('@', i);
      if (at === -1) break;
      i = at + 1;
      skipWS();
      const type = readUntil(['{', '(']).trim().toLowerCase();
      if (!type) continue;
      skipWS();
      const open = text[i];
      if (open !== '{' && open !== '(') continue;

      const rawEntry = readBalanced(open, open === '{' ? '}' : ')');
      const inner = rawEntry.slice(1, -1);

      const commaIdx = inner.indexOf(',');
      if (commaIdx === -1) continue;
      const key = inner.slice(0, commaIdx).trim();
      const body = inner.slice(commaIdx + 1);

      const fields = {};
      for (const part of splitTopLevel(body)) {
        const eqIdx = part.indexOf('=');
        if (eqIdx === -1) continue;
        const name = part.slice(0, eqIdx).trim().toLowerCase();
        const value = parseValue(part.slice(eqIdx + 1));
        if (name) fields[name] = value;
      }

      const year = parseInt(fields.year || '0', 10) || 0;
      const raw = `@${type}${open}${inner}${open === '{' ? '}' : ')'}`;
      entries.push({ type, key, fields, year, raw });
    }

    return entries;
  };

  const escapeHTML = (s) => (s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const parseAuthors = (s) => {
    s = (s || '').trim();
    if (!s) return [];
    return s.split(/\s+and\s+/i).map((name) => {
      name = clampText(name);
      if (name.includes(',')) {
        const [last, rest] = name.split(',').map(clampText);
        return clampText(`${rest} ${last}`);
      }
      return name;
    }).filter(Boolean);
  };

  const venueOf = (f) => f.journal || f.booktitle || f.publisher || f.organization || f.school || f.institution || f.howpublished || '';

  const bestLink = (f) => {
    if (f.url) return f.url;
    if (f.doi) return `https://doi.org/${f.doi}`;
    return '';
  };

  const derivedType = (e) => {
    const f = e.fields;
    const t = (f.title || '').toLowerCase();
    const note = (f.note || '').toLowerCase();
    const how = (f.howpublished || '').toLowerCase();
    if (e.type === 'misc' && (t.includes('patent') || note.includes('patent') || how.includes('patent') || f.number)) return 'patent';
    return e.type;
  };

  const blobOf = (e) => {
    const f = e.fields;
    return clampText([
      f.title,
      f.author,
      venueOf(f),
      f.abstract,
      f.keywords,
      f.note,
      f.howpublished,
      f.doi,
      f.url,
      String(e.year),
      e.type
    ].filter(Boolean).join(' ')).toLowerCase();
  };

  // Topics are loaded from topics.json (with fallback defaults)
  const DEFAULT_TOPICS = [
    {
      id: 'sda',
      label: 'Space Domain Awareness (SDA) & Object Characterization',
      hint: 'Unresolved spectroscopy • photometry/light curves • simulation datasets',
      description: '',
      match: { regex: '(space domain|\\bsda\\b|satellite|space object|rocket\\b|rocket-body|\\borbit\\b|\\bgeo\\b|\\bgeos\\b|light[- ]curve|photometr|spectroscop|slitless)' }
    },
    {
      id: 'radml',
      label: 'Radiation Sensing & Machine Learning Methods',
      hint: 'Gamma-ray spectra • novelty detection • sparse imaging • estimation',
      description: '',
      match: { regex: '(gamma|radiat|nuclear|spectral|scatter mask|novelty|\\bspars\\w*|compressed sensing|rotating|mask imaging|mixture proportion|irreducib|\\bicml\\b|estimation)' }
    },
    {
      id: 'docs',
      label: 'Computational Imaging & Document Restoration',
      hint: 'Photometric correction • geometry-aware restoration • material/ink identification',
      description: '',
      match: { regex: '(document|photometric|illumination|distorted|restoration|digitiz|ink\\b|material classification|reflectance|scanner|negative\\b|manuscript)' }
    },
    {
      id: 'heritage',
      label: 'Cultural Heritage Digitization & 3D Documentation',
      hint: 'Petroglyphs/rock art • museum digitization • digital libraries',
      description: '',
      match: { regex: '(heritage|petroglyph|rock art|archaeolog|museum|cultural|eh?eritage|d-lib|digital library|geospatial narrative)' }
    },
    {
      id: 'immersive',
      label: 'Immersive Media, Audio/VR & Game Development',
      hint: 'Spatial audio • VR environments • applied development',
      description: '',
      match: { regex: '(\\bvr\\b|virtual reality|immersive|spatial audio|audio virtual|game\\b|unity\\b|unreal\\b)' }
    },
    { id: 'other', label: 'Other', hint: 'Patents • security/authentication • short pieces', description: '', match: { regex: '' } },
  ];

  let TOPICS = DEFAULT_TOPICS.slice();
  let TOPIC_MATCH = new Map();

  const chipLabel = (t) => {
    if (t.chip) return t.chip;
    const map = {
      sda: 'SDA',
      radml: 'Radiation & ML',
      docs: 'Doc restoration',
      heritage: 'Heritage',
      immersive: 'Immersive',
      other: 'Other',
    };
    return map[t.id] || t.label || t.id;
  };

  const classify = (e) => {
    const b = blobOf(e);
    for (const t of TOPICS) {
      const re = TOPIC_MATCH.get(t.id);
      if (re && re.test(b)) return t.id;
    }
    return 'other';
  };

  const buildMatchers = () => {
    TOPIC_MATCH = new Map();
    for (const t of TOPICS) {
      const rx = (t.match && t.match.regex) ? String(t.match.regex) : '';
      if (!rx) continue;
      try {
        TOPIC_MATCH.set(t.id, new RegExp(rx, 'i'));
      } catch {
        // ignore invalid regex
      }
    }
  };

  const renderTopicChips = () => {
    if (!topicChipsRoot) return;
    topicChipsRoot.innerHTML = '';
    for (const t of TOPICS) {
      const a = document.createElement('a');
      a.className = 'chip';
      a.href = `#topic-${t.id}`;
      a.textContent = chipLabel(t);
      topicChipsRoot.appendChild(a);
    }
    const all = document.createElement('a');
    all.className = 'chip';
    all.href = '#publications';
    all.textContent = 'All publications';
    topicChipsRoot.appendChild(all);
  };

  const renderTopicsSection = () => {
    if (!topicsListRoot) return;
    topicsListRoot.innerHTML = '';

    for (const t of TOPICS) {
      const d = document.createElement('details');
      d.className = 'panel topic-panel';
      d.id = `topic-${t.id}`;
      if (t.id === 'sda') d.open = true;

      const s = document.createElement('summary');
      const title = document.createElement('div');
      title.className = 'panel-title';
      title.innerHTML = `<span class="panel-dot" aria-hidden="true"></span>${escapeHTML(t.label || t.id)}`;

      const meta = document.createElement('div');
      meta.className = 'panel-meta muted';
      meta.textContent = t.hint || '';

      s.appendChild(title);
      if (meta.textContent.trim()) s.appendChild(meta);

      const body = document.createElement('div');
      body.className = 'panel-body';

      const desc = clampText(t.description);
      if (desc) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = desc;
        body.appendChild(p);
      }

      const imgs = Array.isArray(t.images) ? t.images : [];
      if (imgs.length) {
        const gallery = document.createElement('div');
        gallery.className = 'topic-gallery';
        for (const im of imgs) {
          const src = im?.src ? String(im.src) : '';
          if (!src) continue;
          const a = document.createElement('a');
          a.className = 'topic-image';
          a.href = src;
          a.target = '_blank';
          a.rel = 'noreferrer';

          const img = document.createElement('img');
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = src;
          img.alt = im?.alt ? String(im.alt) : (t.label || t.id);
          a.appendChild(img);

          gallery.appendChild(a);
        }
        if (gallery.childElementCount) body.appendChild(gallery);
      }

      const links = Array.isArray(t.links) ? t.links : [];
      if (links.length) {
        const ul = document.createElement('ul');
        ul.className = 'list';
        for (const l of links) {
          const url = l?.url ? String(l.url) : '';
          if (!url) continue;
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noreferrer';
          a.textContent = l?.label ? String(l.label) : url;
          li.appendChild(a);
          ul.appendChild(li);
        }
        if (ul.childElementCount) body.appendChild(ul);
      }

      const jump = document.createElement('div');
      jump.className = 'topic-actions';
      const jumpA = document.createElement('a');
      jumpA.className = 'btn';
      jumpA.href = `#pub-${t.id}`;
      jumpA.textContent = 'View publications';
      jump.appendChild(jumpA);
      body.appendChild(jump);

      d.appendChild(s);
      d.appendChild(body);
      topicsListRoot.appendChild(d);
    }
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
      return true;
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied');
        return true;
      } catch {
        toast('Copy failed');
        return false;
      }
    }
  };

  let allEntries = [];

  const applyFilters = () => {
    const q = (state.query || '').toLowerCase();

    let items = allEntries;
    if (state.type !== 'all') items = items.filter(e => derivedType(e) === state.type);
    if (state.year !== 'all') {
      const y = parseInt(state.year, 10);
      items = items.filter(e => e.year === y);
    }
    if (q) {
      items = items.filter(e => blobOf(e).includes(q));
    }

    // Sort: year desc, then title
    return items.slice().sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      const ta = (a.fields.title || '').toLowerCase();
      const tb = (b.fields.title || '').toLowerCase();
      return ta.localeCompare(tb);
    });
  };

  const populateYears = () => {
    if (!yearEl) return;
    const years = Array.from(new Set(allEntries.map(e => e.year).filter(Boolean))).sort((a, b) => b - a);
    for (const y of years) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      yearEl.appendChild(opt);
    }
  };

  const render = () => {
    const filtered = applyFilters();
    const total = filtered.length;

    const years = filtered.map(e => e.year).filter(Boolean);
    const yrMax = years.length ? Math.max(...years) : 0;
    const yrMin = years.length ? Math.min(...years) : 0;
    const range = yrMax && yrMin ? ` (${yrMin}–${yrMax})` : '';
    if (statsEl) statsEl.textContent = `${total} item${total === 1 ? '' : 's'}${range}`;

    const grouped = new Map(TOPICS.map(t => [t.id, []]));
    for (const e of filtered) {
      const tid = classify(e);
      if (!grouped.has(tid)) grouped.set(tid, []);
      grouped.get(tid).push(e);
    }

    topicsRoot.innerHTML = '';

    for (const t of TOPICS) {
      const items = grouped.get(t.id) || [];

      const topicDetails = document.createElement('details');
      topicDetails.className = 'panel pub-topic';
      topicDetails.id = `pub-${t.id}`;
      // open the first topic by default if it has items
      if (t.id === 'sda' && items.length) topicDetails.open = true;

      const summary = document.createElement('summary');
      const titleRow = document.createElement('div');
      titleRow.className = 'panel-title';
      titleRow.innerHTML = `<span class="panel-dot" aria-hidden="true"></span>${escapeHTML(t.label)} <span class="muted">(${items.length})</span>`;

      const metaRow = document.createElement('div');
      metaRow.className = 'panel-meta muted';
      metaRow.textContent = t.hint;

      summary.appendChild(titleRow);
      summary.appendChild(metaRow);

      const body = document.createElement('div');
      body.className = 'panel-body';

      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No items match the current filters.';
        body.appendChild(empty);
      } else {
        const list = document.createElement('div');
        list.className = 'pub-items';

        for (const e of items) {
          const f = e.fields;
          const title = f.title || e.key;
          const authors = parseAuthors(f.author);
          const venue = venueOf(f);
          const link = bestLink(f);
          const dtype = derivedType(e);

          const pub = document.createElement('details');
          pub.className = 'pub-item';

          const ps = document.createElement('summary');

          const top = document.createElement('div');
          top.className = 'pub-item-title';

          const tspan = document.createElement('div');
          tspan.className = 't';
          tspan.textContent = title;

          const badges = document.createElement('div');
          badges.className = 'pub-badges';

          const bType = document.createElement('span');
          bType.className = 'badge';
          bType.textContent = dtype;
          badges.appendChild(bType);

          if (e.year) {
            const bYear = document.createElement('span');
            bYear.className = 'badge';
            bYear.textContent = String(e.year);
            badges.appendChild(bYear);
          }

          top.appendChild(tspan);
          top.appendChild(badges);

          const sub = document.createElement('div');
          sub.className = 'pub-item-sub muted';
          sub.innerHTML = [
            authors.length ? escapeHTML(authors.join(', ')) : '',
            venue ? escapeHTML(venue) : ''
          ].filter(Boolean).join(' • ');

          ps.appendChild(top);
          if (sub.textContent.trim()) ps.appendChild(sub);

          const pb = document.createElement('div');
          pb.className = 'pub-item-body';

          const meta = document.createElement('div');
          meta.className = 'pub-meta';
          meta.innerHTML = [
            authors.length ? `<div class="pub-authors">${escapeHTML(authors.join(', '))}</div>` : '',
            venue ? `<div class="pub-venue muted">${escapeHTML(venue)}</div>` : '',
            e.year ? `<div class="muted">${escapeHTML(String(e.year))}</div>` : ''
          ].filter(Boolean).join('');

          const links = document.createElement('div');
          links.className = 'pub-links';

          if (link) {
            const a = document.createElement('a');
            a.className = 'pub-action';
            a.href = link;
            a.target = '_blank';
            a.rel = 'noreferrer';
            a.textContent = 'Link';
            links.appendChild(a);
          }

          if (f.doi) {
            const a = document.createElement('a');
            a.className = 'pub-action';
            a.href = `https://doi.org/${f.doi}`;
            a.target = '_blank';
            a.rel = 'noreferrer';
            a.textContent = 'DOI';
            links.appendChild(a);
          }

          const copyBtn = document.createElement('button');
          copyBtn.className = 'pub-action';
          copyBtn.type = 'button';
          copyBtn.textContent = 'Copy BibTeX';
          copyBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            copyText(e.raw);
          });
          links.appendChild(copyBtn);

          const bib = document.createElement('details');
          bib.className = 'pub-bib';
          const bibSum = document.createElement('summary');
          bibSum.textContent = 'Cite';
          const pre = document.createElement('pre');
          pre.textContent = e.raw;
          bib.appendChild(bibSum);
          bib.appendChild(pre);

          // Optional abstract
          const abs = clampText(f.abstract);
          if (abs) {
            const p = document.createElement('p');
            p.className = 'muted';
            p.style.marginTop = '0.75rem';
            p.textContent = abs;
            pb.appendChild(p);
          }

          pb.appendChild(meta);
          pb.appendChild(links);
          pb.appendChild(bib);

          pub.appendChild(ps);
          pub.appendChild(pb);

          list.appendChild(pub);
        }

        body.appendChild(list);
      }

      topicDetails.appendChild(summary);
      topicDetails.appendChild(body);
      topicsRoot.appendChild(topicDetails);
    }
  };

  const wire = () => {
    searchEl?.addEventListener('input', (e) => {
      state.query = e.target.value || '';
      render();
    });

    typeEl?.addEventListener('change', (e) => {
      state.type = e.target.value || 'all';
      render();
    });

    yearEl?.addEventListener('change', (e) => {
      state.year = e.target.value || 'all';
      render();
    });

    collapseAllBtn?.addEventListener('click', () => {
      document.querySelectorAll('#publications details').forEach((d) => { d.open = false; });
      toast('Collapsed');
    });
  };

  const load = async () => {
    try {
      // Load topics.json (optional) to define descriptions/images + classification regex.
      try {
        const tRes = await fetch('topics.json', { cache: 'no-cache' });
        if (tRes.ok) {
          const tJson = await tRes.json();
          const arr = Array.isArray(tJson?.topics) ? tJson.topics : [];
          if (arr.length) TOPICS = arr.map((x) => ({
            id: String(x.id || '').trim() || 'other',
            label: x.label || x.title || String(x.id || ''),
            hint: x.hint || '',
            chip: x.chip || '',
            description: x.description || '',
            images: Array.isArray(x.images) ? x.images : [],
            links: Array.isArray(x.links) ? x.links : [],
            match: x.match || {}
          }));
        }
      } catch {
        // ignore, fallback to defaults
      }

      // Ensure required topic "other" exists.
      if (!TOPICS.some(t => t.id === 'other')) {
        TOPICS.push({ id: 'other', label: 'Other', hint: '', description: '' });
      }

      buildMatchers();
      renderTopicChips();
      renderTopicsSection();

      const res = await fetch('bibliography.bib', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();

      const parsed = parseBibTeX(text);

      // De-dupe by key (keep last)
      const byKey = new Map();
      for (const e of parsed) byKey.set(e.key, e);
      allEntries = Array.from(byKey.values());

      populateYears();
      wire();
      render();
    } catch (err) {
      topicsRoot.innerHTML = '';
      const d = document.createElement('div');
      d.className = 'muted';
      d.textContent = `Could not load bibliography.bib (${err?.message || err}).`;
      topicsRoot.appendChild(d);
    }
  };

  load();
})();

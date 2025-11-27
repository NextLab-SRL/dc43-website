mermaid.initialize({ startOnLoad: false, theme: 'default' });

// config
const MERMAID_PATH = '/assets/data/story.mmd';
const MAP_PATH = '/assets/data/mermaid-map.json';
let mermaidMap = { nodes: {}, edges: {} };

// fetch helper
async function fetchText(path) {
    try { const r = await fetch(path, { cache: 'no-store' }); if (!r.ok) return null; return await r.text(); }
    catch (e) { return null; }
}

// load initial files
async function fetchInitial() {
    document.getElementById('error').textContent = '';
    const src = await fetchText(MERMAID_PATH);
    if (src !== null) document.getElementById('source').value = src;
    else { document.getElementById('source').value = '// Could not fetch ' + MERMAID_PATH; document.getElementById('error').textContent = 'Warning: could not fetch ' + MERMAID_PATH; }
    const mapText = await fetchText(MAP_PATH);
    if (mapText !== null) {
        try { mermaidMap = JSON.parse(mapText); } catch (e) { mermaidMap = { nodes: {}, edges: {} }; console.warn('mermaid-map parse fail', e); }
    } else { mermaidMap = { nodes: {}, edges: {} }; }
}

// robust render (compatible with mermaid versions)
async function render() {
    const src = document.getElementById('source').value;
    const target = document.getElementById('mermaid-container');
    const errEl = document.getElementById('error');
    errEl.textContent = '';
    if (!src || !src.trim()) { target.innerHTML = '<div style="color:#64748b">No Mermaid source to render.</div>'; return; }

    const uid = 'mmd_' + Date.now();
    try {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        let svgCode = null;
        if (typeof mermaid.render === 'function') {
            const res = await mermaid.render(uid, src);
            if (typeof res === 'string') svgCode = res;
            else if (res && typeof res === 'object') svgCode = res.svg || res;
            else svgCode = String(res);
        } else if (mermaid.mermaidAPI && typeof mermaid.mermaidAPI.render === 'function') {
            svgCode = await new Promise((resolve, reject) => {
                try { mermaid.mermaidAPI.render(uid, src, (svg) => resolve(svg)); } catch (e) { reject(e); }
            });
        } else throw new Error('No compatible Mermaid render API found.');

        // insert svg
        target.innerHTML = svgCode;

        // small timeout to let DOM paint
        setTimeout(() => {
            try { enhanceMermaidWithTooltips(typeof mermaidMap !== 'undefined' ? mermaidMap : null); }
            catch (e) { console.warn('tooltip enhancement failed', e); }

            // pan/zoom init
            const svgEl = target.querySelector('svg');
            if (svgEl) {
                // destroy previous
                if (window.__svgPanZoomInstance) { try { window.__svgPanZoomInstance.destroy(); } catch (e) { } window.__svgPanZoomInstance = null; }
                // init (safely)
                if (typeof svgPanZoom === 'function') {
                    try {
                        window.__svgPanZoomInstance = svgPanZoom(svgEl, {
                            zoomEnabled: true,
                            controlIconsEnabled: false,
                            fit: true, center: true,
                            minZoom: 0.25, maxZoom: 6,
                            zoomScaleSensitivity: 0.2, dblClickZoomEnabled: false, panEnabled: true
                        });
                    } catch (e) { console.warn('svgPanZoom init failed', e); window.__svgPanZoomInstance = null; }
                } else {
                    console.warn('svgPanZoom not available, skipping pan/zoom.');
                }

                // wire zoom buttons
                document.getElementById('btn-zoom-in').onclick = () => window.__svgPanZoomInstance && window.__svgPanZoomInstance.zoomIn();
                document.getElementById('btn-zoom-out').onclick = () => window.__svgPanZoomInstance && window.__svgPanZoomInstance.zoomOut();
                document.getElementById('btn-zoom-reset').onclick = () => {
                    if (!window.__svgPanZoomInstance) return;
                    window.__svgPanZoomInstance.resetZoom(); window.__svgPanZoomInstance.fit(); window.__svgPanZoomInstance.center();
                };
            }

        }, 80);

    } catch (err) {
        console.error('Mermaid render failed:', err);
        errEl.textContent = 'Render error: ' + (err && err.message ? err.message : String(err));
        target.innerHTML = '<pre style="color:#b91c1c;">' + (err && err.stack ? err.stack : String(err)) + '</pre>';
    }
}

// enhanceMermaidWithTooltips: robust and uses appendTo: body
function enhanceMermaidWithTooltips(mermaidMapArg) {
    const providedMap = mermaidMapArg || (typeof mermaidMap !== 'undefined' ? mermaidMap : null);
    const container = document.getElementById('mermaid-container');
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    function normalizeId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
    function parseLabelForScreenshotsAndText(raw) {
        if (!raw) return { files: [], text: '' };
        const files = (raw.match(/\b[\w\-_.]+?\.(?:png|jpg|jpeg|gif)\b/gi) || []).map(f => f.trim());
        let txt = raw;
        files.forEach(f => { const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); txt = txt.replace(re, ''); });
        txt = txt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return { files, text: txt };
    }

    // build map fallback and (important) normalize provided map keys into mermaid-generated ids
    const map = { nodes: {}, edges: {} };
    let usedProvided = false;
    if (providedMap && ((providedMap.nodes && Object.keys(providedMap.nodes).length) || (providedMap.edges && Object.keys(providedMap.edges).length))) {
        // copy provided (we'll augment it by mapping semantic keys to generated ids)
        map.nodes = Object.assign({}, providedMap.nodes || {});
        map.edges = Object.assign({}, providedMap.edges || {});
        usedProvided = true;
    }

    // collect node/edge groups
    const nodeGroups = Array.from(svg.querySelectorAll('g.node'));
    const edgeGroups = Array.from(svg.querySelectorAll('g.edge'));

    // Helper: attempt to map a mermaid-generated id to a providedMap key.
    // Mermaid ids look like: "flowchart-W0_S1-1" or similar.
    function tryMapProvidedNode(mid, labelText) {
        if (!providedMap || !providedMap.nodes) return null;
        // 1) look for pattern W<d>_S<d> or W<d>_<word> inside the mermaid id
        const m = mid.match(/W\d+_[A-Z0-9]+/i);
        if (m) {
            const key = m[0].toLowerCase();
            if (providedMap.nodes[key]) return providedMap.nodes[key];
        }
        // 2) try stripping "flowchart-" prefix and trailing "-\d+" then lowercase
        let base = mid.replace(/^flowchart[-_]/i, '').replace(/-\d+$/, '').toLowerCase();
        if (providedMap.nodes[base]) return providedMap.nodes[base];
        // 3) try label-based heuristics: see if any provided key is contained in label text (loose)
        const _label = (labelText || '').toLowerCase();
        for (const k of Object.keys(providedMap.nodes)) {
            const test = k.toLowerCase().replace(/_/g, ' ');
            if (test && _label.includes(test)) return providedMap.nodes[k];
        }
        return null;
    }

    function tryMapProvidedEdge(mid, labelText) {
        if (!providedMap || !providedMap.edges) return null;
        // similar heuristics
        const m = mid.match(/W\d+_[A-Z0-9]+/i);
        if (m) {
            const key = m[0].toLowerCase();
            if (providedMap.edges[key]) return providedMap.edges[key];
        }
        let base = mid.replace(/^flowchart[-_]/i, '').replace(/-\d+$/, '').toLowerCase();
        if (providedMap.edges[base]) return providedMap.edges[base];
        for (const k of Object.keys(providedMap.edges || {})) {
            const test = k.toLowerCase().replace(/_/g, ' ');
            if (test && (labelText || '').toLowerCase().includes(test)) return providedMap.edges[k];
        }
        return null;
    }

    // ensure map entries exist for nodes/edges (either from providedMap or parsed label)
    function ensureNodeEntry(mid, labelText) {
        if (map.nodes[mid]) return;
        // try to fetch from provided map using heuristics if available
        if (providedMap && providedMap.nodes) {
            const provided = tryMapProvidedNode(mid, labelText);
            if (provided) {
                map.nodes[mid] = provided;
                return;
            }
        }
        const parsed = parseLabelForScreenshotsAndText(labelText);
        const ss = parsed.files.map(fn => ({ file: (fn.startsWith('/') ? fn : ('assets/screenshots/' + fn)), alt: parsed.text }));
        map.nodes[mid] = { screenshots: ss, story_text: parsed.text || labelText || mid };
    }

    function ensureEdgeEntry(mid, labelText) {
        if (map.edges[mid]) return;
        if (providedMap && providedMap.edges) {
            const provided = tryMapProvidedEdge(mid, labelText);
            if (provided) {
                map.edges[mid] = provided;
                return;
            }
        }
        const parsed = parseLabelForScreenshotsAndText(labelText);
        const ss = parsed.files.map(fn => ({ file: (fn.startsWith('/') ? fn : ('assets/screenshots/' + fn)), alt: parsed.text }));
        map.edges[mid] = { screenshots: ss, story_text: parsed.text || labelText || mid };
    }

    // populate entries
    nodeGroups.forEach(g => {
        const textEl = g.querySelector('text');
        const label = textEl ? textEl.textContent : '';
        const mid = g.id || normalizeId(label || '');
        g.setAttribute('data-mid', mid);
        g.setAttribute('tabindex', '0');
        if (!usedProvided || !map.nodes[mid]) ensureNodeEntry(mid, label);
    });

    edgeGroups.forEach(g => {
        const titleEl = g.querySelector('title'); const textEl = g.querySelector('text');
        const label = (titleEl && titleEl.textContent) ? titleEl.textContent : (textEl ? textEl.textContent : '');
        const mid = g.id || normalizeId(label || '');
        g.setAttribute('data-mid', mid);
        g.setAttribute('tabindex', '0');
        if (!usedProvided || !map.edges[mid]) ensureEdgeEntry(mid, label);
    });

    // (optional) debug: how many mapped vs provided
    try {
        const providedNodeCount = providedMap && providedMap.nodes ? Object.keys(providedMap.nodes).length : 0;
        console.debug('mermaid-tooltip: provided nodes=', providedNodeCount, 'mapped nodes=', Object.keys(map.nodes).length);
    } catch (e) { }

    // destroy previous tippies
    try { if (window.__tippyInstances) { window.__tippyInstances.forEach(i => i && i.destroy && i.destroy()); } } catch (e) { }
    window.__tippyInstances = [];

    // modal util (same as before)
    function openImageModal(src, caption) {
        let modal = document.getElementById('story-image-modal');
        if (!modal) {
            modal = document.createElement('div'); modal.id = 'story-image-modal';
            Object.assign(modal.style, { position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 });
            modal.innerHTML = `<div style="max-width:90%;max-height:90%;background:#fff;padding:12px;border-radius:8px;box-shadow:0 6px 20px rgba(2,6,23,0.4);">
            <img id="modal-img" src="" style="max-width:100%;max-height:70vh;display:block;border-radius:6px"/>
            <div id="modal-caption" style="margin-top:8px;color:#111"></div>
            <div style="margin-top:8px;text-align:right;"><button id="modal-close">Close</button></div>
        </div>`;
            document.body.appendChild(modal);
            modal.querySelector('#modal-close').addEventListener('click', () => modal.style.display = 'none');
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
        }
        modal.querySelector('#modal-img').src = src;
        modal.querySelector('#modal-caption').textContent = caption || '';
        modal.style.display = 'flex';
    }

    // base tippy options that append to body and avoid overflow
    const tippyOptsBase = {
        allowHTML: true,
        interactive: true,
        appendTo: () => document.body,
        placement: 'right',
        delay: [80, 40],
        hideOnClick: false,
        popperOptions: { modifiers: [{ name: 'preventOverflow', options: { boundary: document.body } }, { name: 'flip', options: { boundary: document.body } }] },
        onCreate(instance) { try { if (instance.popper) instance.popper.style.zIndex = 999999; } catch (e) { } }
    };

    // attach tippies for nodes
    nodeGroups.forEach(g => {
        const mid = g.getAttribute('data-mid');
        const mapEntry = map.nodes[mid] || { screenshots: [], story_text: mid };
        const labelText = mapEntry.story_text || mid;

        const contentBuilder = () => {
            const wrapper = document.createElement('div'); wrapper.style.maxWidth = '380px'; wrapper.style.fontSize = '0.95rem';
            if (mapEntry.screenshots && mapEntry.screenshots.length) {
                const ss = mapEntry.screenshots[0];
                const img = document.createElement('img'); img.src = ss.file; img.alt = ss.alt || ''; img.className = 'mermaid-popup-img'; img.style.cursor = 'zoom-in';
                img.addEventListener('click', () => openImageModal(ss.file, ss.alt || labelText));
                wrapper.appendChild(img);
            }
            return wrapper;
        };

        let tipInstance = null;
        try {
            const tt = tippy(g, Object.assign({}, tippyOptsBase, { content: contentBuilder() }));
            tipInstance = Array.isArray(tt) ? tt[0] : tt;
            if (tipInstance && tipInstance.popper) tipInstance.popper.style.zIndex = 999999;
            if (tipInstance) window.__tippyInstances.push(tipInstance);
        } catch (e) { console.warn('tippy init failed', e); tipInstance = null; }

        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.click(); } });
    });

    // attach tippies for edges
    edgeGroups.forEach(g => {
        const mid = g.getAttribute('data-mid');
        const mapEntry = map.edges[mid] || { screenshots: [], story_text: mid };
        const labelText = mapEntry.story_text || mid;

        const contentBuilder = () => {
            const wrapper = document.createElement('div'); wrapper.style.maxWidth = '320px'; wrapper.style.fontSize = '0.95rem';
            if (mapEntry.screenshots && mapEntry.screenshots.length) {
                const ss = mapEntry.screenshots[0];
                const img = document.createElement('img'); img.src = ss.file; img.alt = ss.alt || ''; img.className = 'mermaid-popup-img'; img.style.cursor = 'zoom-in';
                img.addEventListener('click', () => openImageModal(ss.file, ss.alt || labelText));
                wrapper.appendChild(img);
            }
            const p = document.createElement('div'); p.style.marginTop = '6px'; p.textContent = labelText; wrapper.appendChild(p);
            return wrapper;
        };

        let tipInstance = null;
        try {
            const tt = tippy(g, Object.assign({}, tippyOptsBase, { content: contentBuilder(), placement: 'top' }));
            tipInstance = Array.isArray(tt) ? tt[0] : tt;
            if (tipInstance && tipInstance.popper) tipInstance.popper.style.zIndex = 999999;
            if (tipInstance) window.__tippyInstances.push(tipInstance);
        } catch (e) { console.warn('tippy init failed (edge)', e); tipInstance = null; }

        g.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); g.click(); } });
    });

} // end function

// init
(async function init() {
    await fetchInitial();
    // leave rendering manual so you can edit source
})();

// download
document.getElementById('btn-download').addEventListener('click', () => {
    const blob = new Blob([document.getElementById('source').value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'story.mmd'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// render button
document.getElementById('btn-render').addEventListener('click', render);

// convenience: debug helper to inspect tippy boxes & instances
window.__debugTippies = function () {
    console.log('tippy defined?', typeof tippy);
    console.log('tippy instances', window.__tippyInstances ? window.__tippyInstances.length : 0);
    console.log('tippy boxes:', document.querySelectorAll('.tippy-box').length);
    document.querySelectorAll('.tippy-box').forEach((b, i) => {
        console.log(i, 'display=', getComputedStyle(b).display, 'visibility=', getComputedStyle(b).visibility, 'zIndex=', getComputedStyle(b).zIndex, b);
    });
}

/* visuals.js - vanilla JS, depends on Bootstrap's modal */
async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to fetch ${path}`);
  return r.json();
}

function createHotspotBtn(hs) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm hotspot pulse';
  btn.style.left = hs.x + '%';
  btn.style.top = hs.y + '%';
  btn.textContent = hs.label;
  btn.setAttribute('data-title', hs.title || '');
  btn.setAttribute('data-body', hs.body || '');
  btn.setAttribute('data-code', hs.code || '');
  btn.setAttribute('data-docs', hs.docs || '#');
  btn.setAttribute('aria-label', `${hs.label}. ${hs.title}`);
  btn.addEventListener('click', () => {
    const modalTitle = document.getElementById('shotModalLabel');
    const modalBody = document.getElementById('shotModalBody');
    const modalCode = document.getElementById('shotModalCode');
    const modalDocs = document.getElementById('shotModalDocs');
    modalTitle.textContent = hs.title || 'Info';
    modalBody.textContent = hs.body || '';
    modalCode.textContent = hs.code || '';
    modalDocs.href = hs.docs || '#';
    const bsModal = new bootstrap.Modal(document.getElementById('shotModal'));
    bsModal.show();
  });
  return btn;
}

function makeCopyButton(preEl) {
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-outline-secondary ms-2';
  btn.textContent = 'Copy';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(preEl.textContent).then(() => {
      btn.textContent = 'Copied';
      setTimeout(()=>btn.textContent='Copy',1200);
    });
  });
  return btn;
}

function renderAnnotatedImage(container, imageData) {
  const wrap = document.createElement('div');
  wrap.className = 'screenshot-wrap';
  const img = document.createElement('img');
  img.className = 'screenshot-img';
  img.src = imageData.file;
  img.alt = imageData.alt || '';
  img.loading = 'lazy';
  wrap.appendChild(img);
  imageData.hotspots.forEach(hs => {
    const btn = createHotspotBtn(hs);
    btn.style.position = 'absolute';
    // offset to center the small circle
    btn.style.transform = 'translate(-50%, -50%)';
    wrap.appendChild(btn);
  });
  // accessible transcript
  const transcript = document.createElement('div');
  transcript.className = 'mt-2 muted small';
  transcript.setAttribute('aria-hidden','false');
  transcript.textContent = 'Labels: ' + imageData.hotspots.map(h=>`${h.label}. ${h.title}`).join(' — ');
  container.appendChild(wrap);
  container.appendChild(transcript);
}

function renderPersonaTabs(personas) {
  const nav = document.createElement('ul');
  nav.className = 'nav nav-pills mb-3';
  nav.role='tablist';

  const contents = document.createElement('div');
  contents.className = 'tab-content';

  personas.forEach((p, idx) => {
    // tab
    const li = document.createElement('li');
    li.className='nav-item';
    const a = document.createElement('button');
    a.className = 'nav-link' + (idx===0 ? ' active' : '');
    a.type='button';
    a.textContent=p.title;
    a.setAttribute('data-bs-toggle','pill');
    a.setAttribute('data-bs-target','#persona-'+p.id);
    li.appendChild(a);
    nav.appendChild(li);

    // content pane
    const pane = document.createElement('div');
    pane.className = 'tab-pane fade' + (idx===0 ? ' show active' : '');
    pane.id='persona-'+p.id;

    // layout: two-column on md+
    const row = document.createElement('div');
    row.className='row align-items-start';
    const left = document.createElement('div');
    left.className='col-md-7';
    const hero = document.createElement('img');
    const heroData = typeof p.hero === 'string' ? {src:p.hero, alt:`${p.title} hero`} : p.hero || {};
    hero.src = heroData.src;
    hero.alt = heroData.alt || `${p.title} hero`;
    hero.className='img-fluid rounded';
    hero.loading='lazy';
    left.appendChild(hero);

    const right = document.createElement('div');
    right.className='col-md-5';
    const story = document.createElement('div');
    story.className='persona-story';
    story.innerHTML = `<p class="muted">${p.story}</p>`;
    right.appendChild(story);

    // small images
    const smallRow = document.createElement('div');
    smallRow.className='row g-2 mt-2';
    (p.images || []).forEach(imgData => {
      const col = document.createElement('div');
      col.className='col-6';
      const s = document.createElement('img');
      const info = typeof imgData === 'string' ? {src:imgData, alt:`${p.title} visual`} : imgData;
      s.src=info.src; s.className='img-fluid rounded'; s.loading='lazy';
      s.alt = info.alt || `${p.title} visual`;
      col.appendChild(s);
      smallRow.appendChild(col);
    });
    right.appendChild(smallRow);

    // CTAs
    const ctaWrap = document.createElement('div');
    ctaWrap.className='mt-3';
    (p.ctas || []).forEach(cta => {
      const b = document.createElement('a');
      b.className='btn btn-outline-primary me-2 mb-2';
      b.href=cta.href;
      b.target='_blank';
      b.textContent = cta.label;
      ctaWrap.appendChild(b);
    });
    right.appendChild(ctaWrap);

    row.appendChild(left);
    row.appendChild(right);
    pane.appendChild(row);
    contents.appendChild(pane);
  });

  const container = document.createElement('div');
  container.appendChild(nav);
  container.appendChild(contents);
  return container;
}

async function initVisuals() {
  try {
    const hotspotsData = await loadJSON('/dc43-website/assets/data/hotspots.json');
    const personasData = await loadJSON('/dc43-website/assets/data/personas.json');
    // Insert visuals section
    const container = document.getElementById('visuals-root');
    if (!container) return;
    // persona tabs
    const personaBlock = renderPersonaTabs(personasData.personas || []);
    container.appendChild(personaBlock);

    // Integration helper block
    const demoPanel = document.createElement('div');
    demoPanel.className='visuals-panel mt-3';
    demoPanel.innerHTML = `
<h5>Integration helper</h5>
<div id="integration-image-container"></div>
<div class="d-flex flex-column flex-md-row align-items-start mt-3">
  <div class="flex-fill">
    <div class="d-flex align-items-center mb-2">
      <span class="fw-semibold">Databricks adapter snippet</span>
    </div>
    <pre class="code-block mb-0"><code id="integration-helper-code" class="small">from dc43 import write_with_governance\nwrite_with_governance(df, contract=\"bronze/orders\", enforce=True, workspace=\"myws\")</code></pre>
  </div>
  <div class="ms-md-3 mt-2 mt-md-0">
    <button id="integration-helper-copy" class="btn btn-sm btn-outline-secondary mb-2">Copy</button><br>
    <a href="https://github.com/NextLab-SRL/dc43/tree/main/examples/databricks" target="_blank" class="btn btn-sm btn-primary">Open in Databricks</a>
  </div>
</div>`;
    container.appendChild(demoPanel);

    const copyBtn = demoPanel.querySelector('#integration-helper-copy');
    const codeEl = demoPanel.querySelector('#integration-helper-code');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        copyBtn.textContent='Copied';
        setTimeout(()=>copyBtn.textContent='Copy',1200);
      });
    });

    // find the image named 'integration-helper'
    const imageData = (hotspotsData.images || []).find(i => i.id === 'integration-helper');
    if (imageData) {
      const imgCont = document.getElementById('integration-image-container');
      renderAnnotatedImage(imgCont, imageData);
    }

    // create modal HTML (only once)
    if (!document.getElementById('shotModal')) {
      const modalHtml = `
<div class="modal fade" id="shotModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="shotModalLabel">Label</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p id="shotModalBody"></p>
        <div class="d-flex align-items-start flex-column flex-md-row">
          <pre style="flex:1;" class="code-block mb-2 mb-md-0"><code id="shotModalCode" class="small"></code></pre>
          <div class="ms-md-3">
             <a id="shotModalDocs" class="btn btn-sm btn-outline-primary mb-2" target="_blank">Open docs</a><br>
             <button id="shotModalCopy" class="btn btn-sm btn-outline-secondary">Copy</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      // wire copy button
      document.getElementById('shotModalCopy').addEventListener('click', () => {
        const text = document.getElementById('shotModalCode').textContent || '';
        navigator.clipboard.writeText(text).then(()=> {
          const b = document.getElementById('shotModalCopy');
          b.textContent='Copied';
          setTimeout(()=>b.textContent='Copy',1200);
        });
      });
    }
  } catch (err) {
    console.error('visuals init error', err);
  }
}

document.addEventListener('DOMContentLoaded', initVisuals);

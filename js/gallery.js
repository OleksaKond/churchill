(function () {
  const grid = document.getElementById('gallery-grid');
  if (!grid) return;

  const items = Array.from(grid.querySelectorAll('.gitem'));
  const filterBar = document.getElementById('gallery-filters');

  // --- Category filtering ---
  function applyFilter(cat) {
    items.forEach(el => {
      const show = cat === 'all' || el.dataset.cat === cat;
      el.classList.toggle('is-hidden', !show);
    });
    filterBar.querySelectorAll('.filter-btn').forEach(btn => {
      const active = btn.dataset.filter === cat;
      btn.classList.toggle('is-active', active);
      btn.classList.toggle('border-white/20', !active);
      btn.classList.toggle('text-gray-300', !active);
    });
  }

  filterBar.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (btn) applyFilter(btn.dataset.filter);
  });

  // --- Lightbox ---
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lb-img');
  let visible = [];
  let index = 0;

  function open(el) {
    visible = items.filter(i => !i.classList.contains('is-hidden'));
    index = visible.indexOf(el);
    show();
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function show() {
    const el = visible[index];
    const img = el.querySelector('img');
    lbImg.src = el.dataset.src;
    lbImg.alt = img ? img.alt : '';
  }
  function close() {
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    lbImg.src = '';
    document.body.style.overflow = '';
  }
  function step(dir) {
    if (!visible.length) return;
    index = (index + dir + visible.length) % visible.length;
    show();
  }

  grid.addEventListener('click', e => {
    const el = e.target.closest('.gitem');
    if (el) open(el);
  });
  document.getElementById('lb-close').addEventListener('click', close);
  document.getElementById('lb-prev').addEventListener('click', e => { e.stopPropagation(); step(-1); });
  document.getElementById('lb-next').addEventListener('click', e => { e.stopPropagation(); step(1); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  document.addEventListener('keydown', e => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
})();

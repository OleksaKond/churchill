(function () {
  const STORAGE_KEY = 'churchill-age-verified';

  function setGateVisible(gate, visible) {
    if (visible) {
      gate.style.display = 'flex';
      requestAnimationFrame(() => { gate.style.opacity = '1'; });
      document.body.classList.add('overflow-hidden');
    } else {
      gate.style.opacity = '0';
      setTimeout(() => {
        gate.style.display = 'none';
        document.body.classList.remove('overflow-hidden');
      }, 500);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const gate = document.getElementById('age-gate');
    if (!gate) return;

    if (localStorage.getItem(STORAGE_KEY) !== 'true') {
      setGateVisible(gate, true);
    }

    gate.querySelectorAll('[data-age-confirm]').forEach(button => {
      button.addEventListener('click', () => {
        if (button.getAttribute('data-age-confirm') === 'yes') {
          localStorage.setItem(STORAGE_KEY, 'true');
          setGateVisible(gate, false);
        } else {
          window.location.href = '../sorry.html?lang=' + (document.documentElement.lang || 'pl');
        }
      });
    });
  });
})();

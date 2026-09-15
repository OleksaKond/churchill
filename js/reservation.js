(function () {
  // ── CONFIG ────────────────────────────────────────────────────────────
  // Paste your deployed Cloudflare Worker URL here after `wrangler deploy`.
  // e.g. 'https://churchill-reservations.your-subdomain.workers.dev/reserve'
  const ENDPOINT = 'https://churchill-reservations.oleksa274.workers.dev/reserve';
  // ──────────────────────────────────────────────────────────────────────

  const form = document.getElementById('reservation-form');
  if (!form) return;

  const btn = document.getElementById('reservation-submit');
  const statusEl = document.getElementById('reservation-status');

  // Fill the time dropdown with 24-hour slots (00:00–23:30, every 30 min).
  const timeSel = document.getElementById('reservation-time');
  if (timeSel) {
    for (let m = 0; m < 24 * 60; m += 30) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const opt = document.createElement('option');
      opt.value = opt.textContent = hh + ':' + mm;
      timeSel.appendChild(opt);
    }
  }

  function lang() {
    return document.documentElement.lang || 'en';
  }

  // Read a translation for the current language, with an English fallback.
  function t(key, fallback) {
    const l = lang();
    const dict = (window.translations && window.translations[l]) || {};
    const en = (window.translations && window.translations.en) || {};
    return dict[key] || en[key] || fallback;
  }

  function setStatus(msg, ok) {
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden', 'text-gold-accent', 'text-red-400');
    statusEl.classList.add(ok ? 'text-gold-accent' : 'text-red-400');
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      date: form.date.value,
      time: form.time.value,
      guests: form.guests.value,
      requests: form.requests.value.trim(),
      website: form.website.value, // honeypot — must stay empty
      lang: lang()
    };

    btn.disabled = true;
    setStatus(t('reservation.sending', 'Sending your request…'), true);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Bad status ' + res.status);
      setStatus(t('reservation.success', 'Thank you! Your request has been sent. We will confirm by email shortly.'), true);
      form.reset();
    } catch (err) {
      setStatus(t('reservation.error', 'Something went wrong. Please call us or try again later.'), false);
    } finally {
      btn.disabled = false;
    }
  });
})();

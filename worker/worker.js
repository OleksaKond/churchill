/**
 * Churchill's reservation backend (Cloudflare Worker).
 *
 * Endpoints:
 *   POST /reserve           ← the website form posts here
 *   POST /telegram-webhook  ← Telegram calls here when Accept/Decline is tapped
 *   GET  /                  ← health check
 *
 * Secrets/vars (set with `wrangler secret put` — see SETUP.md):
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_SECRET,
 *   RESEND_API_KEY, RESEND_FROM
 * Plain vars (wrangler.toml):
 *   ALLOWED_ORIGIN
 * KV namespace binding: RESERVATIONS
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(env, null, 204);
    }
    if (url.pathname === '/reserve' && request.method === 'POST') {
      return handleReserve(request, env);
    }
    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('Churchill reservation worker OK', { status: 200 });
    }
    return new Response('Not found', { status: 404 });
  }
};

// ── /reserve ──────────────────────────────────────────────────────────────
async function handleReserve(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return corsResponse(env, { ok: false, error: 'bad_json' }, 400);
  }

  // Honeypot: real users never fill this hidden field. Pretend success.
  if (data.website) return corsResponse(env, { ok: true }, 200);

  const name = (data.name || '').toString().trim();
  const email = (data.email || '').toString().trim();
  const phone = (data.phone || '').toString().trim();
  const date = (data.date || '').toString().trim();
  const time = (data.time || '').toString().trim();
  const guests = (data.guests || '').toString().trim();
  const requests = (data.requests || '').toString().trim().slice(0, 1000);
  const lang = ['en', 'pl', 'ar', 'ru'].includes(data.lang) ? data.lang : 'en';

  if (!name || !email || !phone || !date || !time || !guests) {
    return corsResponse(env, { ok: false, error: 'missing_fields' }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return corsResponse(env, { ok: false, error: 'bad_email' }, 400);
  }

  const id = crypto.randomUUID();
  const record = { id, name, email, phone, date, time, guests, requests, lang, status: 'pending' };

  // Keep pending reservations for 7 days.
  await env.RESERVATIONS.put(id, JSON.stringify(record), { expirationTtl: 604800 });

  const text =
    '🕯️ *New reservation request*\n\n' +
    `*Name:* ${esc(name)}\n` +
    `*Email:* ${esc(email)}\n` +
    `*Phone:* ${esc(phone)}\n` +
    `*Date:* ${esc(date)}\n` +
    `*Time:* ${esc(time)}\n` +
    `*Guests:* ${esc(guests)}\n` +
    (requests ? `*Requests:* ${esc(requests)}\n` : '') +
    `*Language:* ${lang.toUpperCase()}`;

  const tg = await tgCall(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'MarkdownV2',
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Accept', callback_data: 'a:' + id },
        { text: '❌ Decline', callback_data: 'd:' + id }
      ]]
    }
  });

  if (!tg.ok) {
    return corsResponse(env, { ok: false, error: 'telegram_failed' }, 502);
  }
  return corsResponse(env, { ok: true }, 200);
}

// ── /telegram-webhook ───────────────────────────────────────────────────────
async function handleWebhook(request, env) {
  // Only Telegram (which knows the secret) may call this.
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('ok', { status: 200 });
  }

  const cq = update.callback_query;
  if (!cq || !cq.data) return new Response('ok', { status: 200 });

  const [action, id] = cq.data.split(':');
  const accepted = action === 'a';
  const raw = id ? await env.RESERVATIONS.get(id) : null;

  if (!raw) {
    await tgCall(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'This request has expired or was already handled.'
    });
    return new Response('ok', { status: 200 });
  }

  const record = JSON.parse(raw);

  if (record.status !== 'pending') {
    await tgCall(env, 'answerCallbackQuery', {
      callback_query_id: cq.id,
      text: 'Already ' + record.status + '.'
    });
    return new Response('ok', { status: 200 });
  }

  record.status = accepted ? 'accepted' : 'declined';
  await env.RESERVATIONS.put(id, JSON.stringify(record), { expirationTtl: 604800 });

  // Email the customer.
  const emailOk = await sendEmail(env, record, accepted);

  // Update the Telegram message: show the decision, remove the buttons.
  const decision = accepted ? '✅ ACCEPTED' : '❌ DECLINED';
  const mailNote = emailOk ? 'customer emailed' : '⚠️ email FAILED';
  await tgCall(env, 'editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text: cq.message.text + '\n\n— ' + decision + ' (' + mailNote + ')',
    reply_markup: { inline_keyboard: [] }
  });

  await tgCall(env, 'answerCallbackQuery', {
    callback_query_id: cq.id,
    text: accepted ? 'Accepted — customer notified.' : 'Declined — customer notified.'
  });

  return new Response('ok', { status: 200 });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function tgCall(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json()).catch(() => ({ ok: false }));
}

async function sendEmail(env, record, accepted) {
  const { subject, html } = emailContent(record, accepted);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: env.RESEND_FROM, to: record.email, subject, html })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Localized customer emails. Falls back to English for unlisted languages.
function emailContent(record, accepted) {
  const when = `${record.date} ${record.time}`;
  const T = {
    en: {
      subAcc: "Your reservation at Churchill's is confirmed",
      subDec: "About your reservation at Churchill's",
      acc: `Dear ${record.name},<br><br>We're delighted to confirm your reservation for <b>${record.guests}</b> guests on <b>${when}</b>.<br><br>We look forward to welcoming you.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Kraków`,
      dec: `Dear ${record.name},<br><br>Thank you for your interest. Unfortunately we're unable to accommodate your reservation for <b>${when}</b> at this time.<br><br>Please call us to discuss alternative dates — we'd love to host you.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Kraków`
    },
    pl: {
      subAcc: "Twoja rezerwacja w Churchill's została potwierdzona",
      subDec: "W sprawie Twojej rezerwacji w Churchill's",
      acc: `Szanowny/a ${record.name},<br><br>Z przyjemnością potwierdzamy Twoją rezerwację dla <b>${record.guests}</b> gości w dniu <b>${when}</b>.<br><br>Nie możemy się doczekać Twojej wizyty.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Kraków`,
      dec: `Szanowny/a ${record.name},<br><br>Dziękujemy za zainteresowanie. Niestety nie jesteśmy w stanie zrealizować Twojej rezerwacji na <b>${when}</b>.<br><br>Zadzwoń do nas, aby ustalić inny termin — z chęcią Cię ugościmy.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Kraków`
    },
    ru: {
      subAcc: "Ваша бронь в Churchill's подтверждена",
      subDec: "По поводу вашей брони в Churchill's",
      acc: `Уважаемый(ая) ${record.name},<br><br>Рады подтвердить вашу бронь на <b>${record.guests}</b> гостей на <b>${when}</b>.<br><br>Ждём вас в гости.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Краков`,
      dec: `Уважаемый(ая) ${record.name},<br><br>Спасибо за интерес. К сожалению, мы не можем подтвердить вашу бронь на <b>${when}</b>.<br><br>Позвоните нам, чтобы обсудить другие даты — будем рады вас видеть.<br><br>— Churchill's Lounge Bar, Skałeczna 1, Краков`
    },
    ar: {
      subAcc: "تم تأكيد حجزك في Churchill's",
      subDec: "بخصوص حجزك في Churchill's",
      acc: `عزيزي ${record.name}،<br><br>يسعدنا تأكيد حجزك لـ <b>${record.guests}</b> ضيوف في <b>${when}</b>.<br><br>نتطلع إلى استقبالك.<br><br>— Churchill's Lounge Bar, Skałeczna 1, كراكوف`,
      dec: `عزيزي ${record.name}،<br><br>شكرًا لاهتمامك. للأسف لا يمكننا تأكيد حجزك في <b>${when}</b> حاليًا.<br><br>يرجى الاتصال بنا لمناقشة مواعيد أخرى — يسعدنا استضافتك.<br><br>— Churchill's Lounge Bar, Skałeczna 1, كراكوف`
    }
  };
  const t = T[record.lang] || T.en;
  return accepted
    ? { subject: t.subAcc, html: t.acc }
    : { subject: t.subDec, html: t.dec };
}

// Escape reserved characters for Telegram MarkdownV2.
function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function corsResponse(env, obj, status) {
  const headers = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (obj === null) return new Response(null, { status, headers });
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(obj), { status, headers });
}

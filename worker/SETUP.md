# Reservation backend — setup

This Cloudflare Worker receives reservation form submissions, forwards them to
your Telegram account with **Accept / Decline** buttons, and emails the customer
the outcome. Do this once. All commands run from inside the `worker/` folder.

---

## 1. Create the Telegram bot

1. In Telegram, open a chat with **@BotFather** → send `/newbot` → follow the
   prompts. Copy the **bot token** it gives you (looks like `123456:ABC-...`).
2. Find the **chat ID** of the account that should receive requests:
   - Open a chat with your new bot and send it any message (e.g. "hi"). This is
     required — bots cannot message you until you message them first.
   - Then open **@userinfobot** and send `/start`; it replies with your numeric
     ID. That number is your `TELEGRAM_CHAT_ID`.
   - (To send to a group instead, add the bot to the group and use the group's
     chat ID — it starts with `-`.)

## 2. Set up Resend (email)

1. Sign up at https://resend.com (free: 3,000 emails/month).
2. **Verify your domain** (Domains → Add). Follow their DNS instructions. Once
   verified you can send from e.g. `reservations@yourdomain.com`.
   - No domain yet? For testing you may send from `onboarding@resend.dev`, but
     verify a real domain before going live or emails will land in spam.
3. Create an **API key** (API Keys → Create). Copy it.

## 3. Install & log in to Wrangler (Cloudflare CLI)

```bash
npm install -g wrangler
wrangler login
```

## 4. Create the KV namespace (stores pending reservations)

```bash
wrangler kv namespace create RESERVATIONS
```

Copy the printed `id` into `wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

## 5. Store the secrets

Run each and paste the value when prompted:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM        # e.g.  Churchill's <reservations@yourdomain.com>
wrangler secret put WEBHOOK_SECRET     # invent a long random string, keep a copy
```

Also edit `wrangler.toml` → `ALLOWED_ORIGIN` to your live site origin
(e.g. `https://oleksakond.github.io`, or your custom domain — no trailing slash).

## 6. Deploy

```bash
wrangler deploy
```

Copy the deployed URL it prints, e.g.
`https://churchill-reservations.<your-subdomain>.workers.dev`.

## 7. Register the Telegram webhook

Tell Telegram to send button taps to your worker. Replace the two placeholders
with your real bot token and the exact `WEBHOOK_SECRET` you set in step 5:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://churchill-reservations.<your-subdomain>.workers.dev/telegram-webhook&secret_token=<WEBHOOK_SECRET>"
```

You should see `{"ok":true,...}`.

## 8. Point the website at the worker

Open **`js/reservation.js`** (in the site, not this folder) and set:

```js
const ENDPOINT = 'https://churchill-reservations.<your-subdomain>.workers.dev/reserve';
```

Then rebuild and push the site:

```bash
python build.py
git add -A && git commit -m "Wire reservation form to worker" && git push
```

---

## Test it

1. Open the live site, submit a reservation with a real email you control.
2. Your Telegram account gets the request with Accept / Decline buttons.
3. Tap one — the message updates to show the decision, and the customer's inbox
   gets the confirmation/decline email.

## Troubleshooting

- **No Telegram message:** you didn't message the bot first (step 1), or the
  token/chat ID is wrong. Check `wrangler tail` while submitting.
- **Buttons do nothing:** webhook not set or `WEBHOOK_SECRET` mismatch — re-run
  step 7. Verify with
  `curl https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo`.
- **No email / spam folder:** domain not verified in Resend, or `RESEND_FROM`
  uses an unverified domain.
- **Form says error / CORS blocked:** `ALLOWED_ORIGIN` doesn't match your site's
  origin exactly. Fix it in `wrangler.toml` and `wrangler deploy` again.

# Pinnacle Awards Platform

Nomination, payment and judging platform for the Pinnacle Awards (Syracuse University Center for the Creator Economy).

Work in progress on the `v1` branch. Start with `VISION.md` and `AGENTS.md`; build status is in `docs/status.md`.

## Testing payments with Stripe test keys

Development, CI and the demo use the built-in checkout simulator (`PAYMENTS_PROVIDER=mock`). To test real Stripe hosted Checkout (needs network access to Stripe and the [Stripe CLI](https://docs.stripe.com/stripe-cli)):

1. In the Stripe dashboard (test mode), copy the secret key `sk_test_…`.
2. Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and copy the `whsec_…` signing secret it prints.
3. In `.env`: `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`. Restart `npm run dev`. Live keys (`sk_live_…`) are refused outside production.
4. Sign in as a nominator, complete an entry, and press **Pay … and submit**. On Stripe's page pay with card `4242 4242 4242 4242`, any future expiry, any CVC and postcode.
5. Back on the entry page the status becomes **Submitted** once the webhook arrives (watch `stripe listen` for `checkout.session.completed` → 200), and the receipt appears in `/dev/mailbox`.
6. To check the cancel path, press the back link on Stripe's page: the entry stays a draft.

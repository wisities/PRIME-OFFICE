# PRIME Virtual Office

Thai-first virtual office for a company team of up to 15 members. React + TypeScript + Vite, Supabase Auth/Postgres/Realtime, deployable to Cloudflare Pages Free.

Start with **[SETUP-TH.md](SETUP-TH.md)** for the complete Thai setup guide.

## Local development

Copy `.env.example` to `.env.local` and set the project URL and publishable key. Never use a secret/service-role key in `VITE_` variables. Without configuration, the app starts in clearly labeled demo mode. With configuration, use Google login or explicitly enter demo mode.

```sh
npm ci
npm run dev -- --port 5174
npm test
npm run build
```

Production site is automatically built and deployed to Cloudflare Pages (**https://prime-virtual-office.pages.dev**) on every `git push` to `master` via GitHub integration.

Full architecture and operational guide in **[SETUP-TH.md](SETUP-TH.md)**.

## Backend setup

Run `supabase/schema.sql` once in a new Supabase database, then `supabase/first-admin.sql` to authorize the owner-designated Google account. Enable Google OAuth and configure the production callback/redirect URLs. No backend credentials with elevated permissions are needed by the browser.

RLS permits internal reads only by active members. All writes are validated by narrow security-definer RPCs. Administrative operations enforce the 15-active-member limit and prohibit self-demotion/deactivation. Knocks are recipient-only, rate-limited, and expire for responses after five minutes. Heartbeats are excluded from Realtime publication to conserve free-plan message quota.

## Checks and limits

`npm test` checks meeting URL validation, demo state recovery, and PostgreSQL/RLS behavior with PGlite. PGlite tests stub Supabase Auth identity and omit hosted Realtime publication, so these do not prove hosted OAuth, Realtime delivery, or simultaneous 15-person operation. Those require the owner's live setup and real accounts.

All four rooms are company-wide. No guest access or per-project room restrictions in v0.1. Online status uses a 30-second heartbeat with 90-second expiry; Realtime membership updates and periodic refresh synchronize state. Google Meet opens in a new tab and is not monitored by this app.

## Artwork

`public/assets/office.png` was generated with the built-in imagegen tool from the approved cartoon concept, then edited into a clean office background with no people, text, logos, or UI. Final prompt: preserve the isometric four-room office architecture, warm wood, plants, navy accents and cartoon style; remove all characters, text, labels, badges and app chrome; frame only the empty office. Interactive room labels and emoji member avatars are rendered by React.

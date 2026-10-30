# Brief: A5s, Home-server mode (pulled forward from Phase 2)

## Goal
Let the iPad app reach the existing backend on the owner's Mac or Linux machine, over the LAN or Tailscale, safely.
This is D2: "home server first", using the owner's Claude subscription through the CLI on that machine. Also let the
coach routes take the run context **from the request** (B22). The iPad keeps its own data (D3), so the server's
SQLite doesn't have the iPad's runs. **The web app on `localhost` must behave exactly as today.**

## Read first
`CLAUDE.md` (AI coach rules), `docs/mobile/BOARD.md` (D2, D3, B20, B22), `docs/mobile/RECON.md` §6–7 (every route,
which ones read server data), `server/index.ts`, `server/ai/*.ts`, `server/db.ts`, `.env.example`, the server tests.

## Owns
- `server/index.ts`: **only** the access hook (lines ~31–38), the `listen` call (~425) and the coach routes' input
  handling. Leave the import lines at the top alone: A1 may change them in parallel.
- New files: `server/access.ts` (with tests) and `server/coachContext.ts` (with tests). Edits in `server/ai/*` only
  where the context input needs them.
- `.env.example`, and a new `docs/mobile/HOME-SERVER.md`.

## Deliver
1. **Binding and access** (`server/access.ts`, pure functions + one Fastify hook):
   - Env: `HOST` (default `127.0.0.1`, unchanged), `APP_TOKEN`, `ALLOWED_HOSTS` (comma list; e.g. a LAN IP or a
     Tailscale name).
   - If `HOST` isn't loopback and `APP_TOKEN` is missing or shorter than 24 characters, **refuse to start** with a
     clear message.
   - Loopback requests with a localhost Host and Origin: exactly today's behaviour, no token needed (the web app
     unchanged).
   - Any other request needs `Authorization: Bearer <APP_TOKEN>` (constant-time compare) **and** a Host in
     `ALLOWED_HOSTS` or the bound IP. Browser requests with a foreign `Origin` stay forbidden (the DNS-rebinding and
     other-site guard stays). Otherwise 401 without a token, 403 for a bad Host or Origin.
   - The native app sends no Origin, and the token is never logged (check the Fastify logger serializers).
   - `GET /api/health`: `{ ok, version, coach: claude CLI available?, tts, stt, youtube: key set? }`. It's the iPad's
     "Test connection". Reuse the existing status checks; no secrets in the output.
2. **Coach context from the request (B22):**
   - For `POST /api/coach/feedback`, `/coach/plan`, `/coach/lesson`, `/coach/month` and `/coach/session`, accept an
     optional `context` body field (zod-validated; compact JSON: recent run summaries, settings, lesson progress, at
     most ~50 KB).
   - When present, use it instead of reading the server's SQLite. When absent, behave exactly as today.
   - Don't write the iPad's data into the server's tables. Plans and lessons generated for the iPad return in the
     response; the iPad stores them (A5 later).
   - Keep prompts in `server/prompts/` unchanged unless a prompt needs the context passed differently. Explain any
     change.
   - Caching: include the context in the cache key, the same way as today's inputs.
   - Write the context schema in `server/coachContext.ts` so it can move to core later.
3. **`docs/mobile/HOME-SERVER.md`:** the owner's steps (Mac and Linux):
   - set `HOST`/`APP_TOKEN`/`ALLOWED_HOSTS` and generate a token (`openssl rand -base64 32`);
   - firewall for that port on that interface only;
   - keep the machine awake (`caffeinate -s` on the Mac);
   - optional Tailscale;
   - a test with `curl`.

## Tests (Vitest, `app.inject`; never touch `data/`, use a temp `DATA_DIR`)
- Loopback + localhost Host: 200, no token (as today).
- Remote IP: without a token 401; wrong token 401; good token + allowed Host 200; good token + foreign Origin 403;
  good token + a Host not allowed 403.
- Refuses to start when non-loopback without a strong token.
- The coach routes use `context` when given, and SQLite otherwise. Mock the AI provider; don't call the CLI.
- **Root `npm test` count = 349 + yours. `npm run build` clean, lint with no new problems.** The server still starts
  on loopback. Use a temp `DATA_DIR`, start it, curl `/api/health`, stop it.

## Do not touch
`data/`, `src/`, `packages/`, `apps/`, `spikes/`, root configs, import lines in `server/index.ts`. Never push. Commit in
your worktree; every message ends with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_012qCzBwXtPvMyyk6zKAziwn
```

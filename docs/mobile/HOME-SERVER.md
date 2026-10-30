# Home-server mode: the iPad uses the coach on your Mac or Linux machine

The iPad app keeps its own practice data (D3). For the AI coach, voice and YouTube search it calls this server on your
Mac or Linux machine, which uses your Claude subscription through the logged-in `claude` CLI (D2). This page turns that
on. Leave it off and nothing changes: the server listens on `127.0.0.1` only, and the web app works as before.

## What changes when it's on

- The server listens on `HOST` as well as for this machine's web app.
- This machine's web app (`localhost`) still needs no token. Everything else must send
  `Authorization: Bearer <APP_TOKEN>` and use a Host name in `ALLOWED_HOSTS` (or the address in `HOST`). Without the
  token it gets 401. A wrong Host, or any browser page (it sends `Origin` or `Sec-Fetch-Site`), gets 403.
- The server won't start if `HOST` isn't loopback and `APP_TOKEN` is missing or shorter than 24 characters. It also
  won't start if `HOST=0.0.0.0` and `ALLOWED_HOSTS` is empty.
- The token is never written to the log. Keep it out of git: it goes in `.env`, which git ignores.
- The rate limits are totals for every caller, so the iPad and the web app share them (60 coach, speech and YouTube
  calls a minute).
- Coach requests from the iPad carry its data (`context`). The server answers from that data and doesn't store it.

## 1. Pick the address the iPad will use

- **Same Wi-Fi:** the machine's LAN address.
  - Mac: `ipconfig getifaddr en0` (Wi-Fi) or System Settings → Wi-Fi → Details.
  - Linux: `ip -4 addr show` (look at `wlan0`/`wlp…` or `eth0`/`enp…`).
  - Give it a fixed address in your router (a DHCP reservation), or the iPad loses the server when it changes.
- **Anywhere (optional):** Tailscale, see step 5. Its `100.x.y.z` address doesn't change.

## 2. Set it in `.env`

```sh
openssl rand -base64 32        # make a token; copy the output
```

Then edit `.env` in the project folder:

```sh
HOST=0.0.0.0                   # every interface: this machine's web app keeps working
ALLOWED_HOSTS=192.168.1.20     # the address from step 1; add more with commas (e.g. 192.168.1.20,100.101.102.103)
APP_TOKEN=paste-the-token-here
```

With `HOST=0.0.0.0` the port is open on every network the machine is on, so do step 3. Another option is to bind
to one address only (`HOST=192.168.1.20`). Then nothing else can reach the port, but the server stops listening on
`localhost`, so the web app on this machine can't reach it.

Start the server as usual (`npm run server`, or `npm run dev` for the web app too). The log says
`Home-server mode on 0.0.0.0: other devices need the APP_TOKEN and one of these Host names: …`.

## 3. Firewall: that port, on that network only

**Linux (ufw):**

```sh
sudo ufw allow in on wlan0 to any port 8787 proto tcp        # your Wi-Fi interface from step 1
sudo ufw allow in on tailscale0 to any port 8787 proto tcp   # only if you use Tailscale
sudo ufw enable && sudo ufw status
```

Without ufw (firewalld): `sudo firewall-cmd --zone=home --change-interface=wlan0 --permanent`, then
`sudo firewall-cmd --zone=home --add-port=8787/tcp --permanent && sudo firewall-cmd --reload`.

**Mac:** the built-in firewall (System Settings → Network → Firewall) works per app, not per port. Turn it on and allow
incoming connections for `node` when macOS asks. To limit the port to one network, bind `HOST` to that address. Or
add a `pf` rule that only passes port 8787 on `en0` and `utun*` (Tailscale) and blocks it elsewhere.

## 4. Keep the machine awake

- **Mac:** keep it plugged in and run the server under `caffeinate -s` (stops sleep while on power):
  `caffeinate -s npm run server`. Or System Settings → Battery → Options → "Prevent automatic sleeping when the
  display is off".
- **Linux:** `systemd-inhibit --what=sleep:idle npm run server`, or turn off automatic suspend in your desktop's power
  settings.

## 5. Optional: Tailscale (reach it away from home, encrypted)

1. Install Tailscale on the machine and on the iPad, and sign in to the same account on both.
2. Find the machine's address: `tailscale ip -4` (a `100.x.y.z` address). The MagicDNS name looks like
   `my-mac.tailnet-name.ts.net`.
3. Add the address to `ALLOWED_HOSTS` (e.g. `ALLOWED_HOSTS=192.168.1.20,100.101.102.103`) and open the port on
   `tailscale0` (Linux) or `utun*` (Mac) in step 3.

Tailscale encrypts the traffic. On plain home Wi-Fi the token travels unencrypted over HTTP, which is fine on a network
you trust and not on public Wi-Fi.

To use HTTPS and the MagicDNS name instead, keep `HOST=127.0.0.1`, set `APP_TOKEN` and
`ALLOWED_HOSTS=my-mac.tailnet-name.ts.net`, and run `tailscale serve --bg 8787`. The iPad then uses
`https://my-mac.tailnet-name.ts.net`, and nothing is open on the LAN. (Not yet tried with this app.)

## 6. Test it with curl

From another machine on the same network (or from this one, using the LAN address rather than `localhost`):

```sh
TOKEN=paste-the-token-here
curl -i http://192.168.1.20:8787/api/health                                   # 401: no token
curl -i -H "Authorization: Bearer $TOKEN" http://192.168.1.20:8787/api/health  # 200
```

The 200 answer is the iPad's "Test connection":

```json
{ "ok": true, "version": "1.0.0", "coach": true, "tts": false, "stt": true, "youtube": true, "provider": "claude-cli:…" }
```

- `coach`: the `claude` CLI runs (or the API key is set). If false, run `claude` once on this machine to log in.
- `tts` / `stt`: Piper and Whisper (through `uv`) are installed. The iPad can use its own voice without them.
- `youtube`: `YOUTUBE_API_KEY` is set (song search).

A 403 with the right token means the Host isn't allowed. Add the exact address or name the iPad uses to
`ALLOWED_HOSTS` and restart.

## For the iPad app: the coach `context`

`POST /api/coach/feedback`, `/plan`, `/lesson`, `/month` and `/session` accept an optional `context` field next to their
usual body (schema: `server/coachContext.ts`, at most 50 KB of JSON). With it, the server reads the student from it and
not from its own database, and it writes nothing to its tables:

| Route | Reads from `context` | Answer with a context |
|---|---|---|
| `feedback` | `charts` (the iPad's saved coach exercises, for the catalog) | as before |
| `plan` | `runs`, `settings.profile/lessons/soreUntil`, `aiLessons`, `plan` (last week's), `teacherNotes`, `songs` (id, title), `charts` | `{ plan, checks }`, without `id`: the iPad stores it |
| `lesson` | `runs` (with `summary`), `settings`, `aiLessons`, `plan`, `teacherNotes`, `songs` (with `notes`, for bites) | `{ data, cached, replaces }`: `replaces` lists the iPad's unstarted coach lessons for that stage to drop |
| `month` | `runs`, `settings.lessons`, `aiLessons`, `teacherNotes`, `monthReport` (the last one) | as before; the iPad keeps the report |
| `session` | `runs` (past takes on this exercise), `settings`, `plan`, `teacherNotes` | as before (server-sent events); the context isn't passed on to the coach |

`runs` are the records the iPad would send to `POST /api/runs`, without `take`. Send what the route needs: recent runs
rather than the whole history. The answer cache keys on the input built from the context, so the same context gives
the cached answer and a changed one asks the coach again.

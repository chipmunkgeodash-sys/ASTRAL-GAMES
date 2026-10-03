# Astral Wisp backend

The server behind the Astral **Browser** page. The page runs Scramjet in the
visitor's browser; this server makes the real connections to websites on its
behalf. Static hosting (Firebase Hosting) can't run it, so it lives on its own.

## What it will and won't do

It is a relay, so it is locked down:

- Only pages on the allowed origins can open a websocket (default: the three
  Astral hosting sites). Add more with `ALLOWED_ORIGINS` / `EXTRA_ORIGINS`.
  This stops *other websites* using it from a browser; it is not a password,
  since a script can send any Origin header.
- Destination ports: 80, 443, 8080, 8443 only (`ALLOWED_PORTS`).
- No private, loopback or link-local addresses, no direct-IP destinations, no UDP.
- 8 websockets per client, 400 total, 200 streams per websocket.
- Destinations are not logged (`LOG_LEVEL=WARN`).

It has no bandwidth limit. Put it on a plan with a bandwidth cap or watch usage.

## Run it

```
npm install
npm test
npm start            # listens on :8080
```

`GET /health` returns `{"ok":true}`. The websocket is at `/wisp/`.

## Host it

It needs any host that runs a Node or Docker app and supports websockets.

**Render** (simplest): push this folder to a GitHub repo, then New + > Blueprint
and pick it. `render.yaml` is included. Your backend address will be
`wss://<service>.onrender.com/wisp/`.

**Fly.io**: `fly launch` in this folder (it detects the Dockerfile), then `fly deploy`.

**Google Cloud Run** (needs the Blaze billing plan):
`gcloud run deploy astral-wisp --source . --allow-unauthenticated --session-affinity`

**Not Firebase Functions**: they don't support long-lived websockets.

## Point the site at it

Either build it in: set `VITE_WISP_URL=wss://<your host>/wisp/` in the Astral
project's `.env.production` and redeploy; or paste the address into the Browser
page's settings (stored per device).

## Environment

| Variable | Default | |
|---|---|---|
| `PORT` | 8080 | set by most hosts |
| `ALLOWED_ORIGINS` | the 3 Astral sites | replaces the list |
| `EXTRA_ORIGINS` | | adds to the list |
| `ALLOWED_PORTS` | 80,443,8080,8443 | |
| `MAX_SOCKETS_PER_IP` / `MAX_SOCKETS` | 8 / 400 | |
| `TRUST_PROXY_HOPS` | 1 | proxies in front that append to X-Forwarded-For |
| `LOG_LEVEL` | WARN | |

Known library issue: wisp-js 0.5.0 crashes on every stream if
`stream_limit_per_host` is set, so that limit is deliberately left unset.

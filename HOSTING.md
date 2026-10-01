# Public hosting

This copy of [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)
adds a production Node entry point for a single, long-running web service.
It serves the built Vite client and mounts the project's existing data-provider
middleware at the same-origin `/api` routes. Provider Settings remains disabled
outside local development.

## Deploy on Render

1. Connect this repository to Render and create a Blueprint from `render.yaml`.
2. Keep the first deployment keyless. The service listens on Render's `PORT`
   and provides a `/healthz` health check.
3. After deployment, open the `onrender.com` URL and check the globe plus a
   keyless live layer such as aircraft or satellites.

The free service sleeps after inactivity, so its first request can take about a
minute to wake. Its in-memory feed state and caches reset when it sleeps or
redeploys. Use one running instance for feeds such as AISStream that maintain
one backend connection.

Do not add server-side paid API keys to a public instance without restricting
provider quotas and setting usage limits. Anyone visiting can trigger the
server's proxy routes. If adding a browser-visible Google Maps key or Cesium
token, restrict it to the deployed domain and needed APIs. The server applies
a 120-request-per-minute API limit per client, alongside the project's own
provider-specific guards; this is a basic public-demo guard, not a billing cap.

## Local smoke check

```sh
npm ci
npm run build
PORT=4180 HOST=127.0.0.1 OPENSKY_AUTH_MODE=anon npm start
curl http://127.0.0.1:4180/healthz
curl http://127.0.0.1:4180/api/adsblol/mil
```

The production entry point is `server/production.js`. The Docker image uses
Node 24 and runs as a non-root user. The source and third-party notices remain
subject to the licenses in `LICENSE` and `THIRD_PARTY_NOTICES.md`.

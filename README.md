# JTS Monitor v1.2

Self-hosted synthetic monitoring for Jasper's Treat Shop. The dashboard is Next.js; the worker runs the proven Playwright desktop/mobile production journey and stores results in SQLite.

## v1.2 highlights

- Professional Overview with availability, average duration, P95, incidents and recent runs
- Manual **Run now** queue from the dashboard
- Full Runs page and per-run diagnostic log viewer
- Incident history with automatic recovery
- Performance history chart
- Monitor inventory page
- Live Settings for frequency, consecutive-failure threshold and retention
- Light/dark mode
- Dashboard auto-refresh every 30 seconds
- Worker reads settings without container rebuild
- Existing production-safe Playwright checkout journey retained; it never clicks Place order

## Deploy

```bash
docker compose up -d --build
```

Open `http://YOUR-VM-IP:3000`.

Useful commands:

```bash
docker compose ps
docker compose logs -f worker
docker compose logs -f dashboard
```

Persistent data lives in the `jts-monitor-data` Docker volume. Playwright artifacts live in `jts-monitor-artifacts`.

## Upgrade from v1.0

Use the same Compose project/volume names and rebuild with v1.2. The SQLite schema is additive, so existing run and incident history is retained.

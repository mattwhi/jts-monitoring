# JTS Synthetic Monitoring v1.4

Synthetic customer-journey monitoring for Jasper's Treat Shop.

## v1.4
- SLA/SLO dashboard with 24h, 7d and 30d windows
- Per-monitor availability and P50/P95/P99 latency
- 99.9% SLO and error-budget tracking
- Incident/recovery history in the reliability view
- JSON reporting endpoint at `/api/report?window=7d`
- Retention cleanup extended to resolved incidents and alert events
- Version remains sourced automatically from package.json

## Existing monitoring
Six Playwright checks cover Homepage & Shop, Guest Checkout and Build-a-Treat-Box on desktop and mobile Chromium. v1.3 alerting and recovery behaviour is preserved.

## Local validation
```bash
npm install
npm run build
npm run test:checkout
docker compose build --no-cache
docker compose up -d
```

Dashboard: http://localhost:3011

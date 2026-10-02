# JTS Synthetic Monitoring v1.6.0

## Visual monitoring
- Persistent baseline screenshot per monitor/device combination.
- Full-page screenshots captured after every synthetic journey.
- Pixel-level visual difference percentage with configurable threshold (default 5%).
- New Visual dashboard showing MATCH / CHANGED / BASELINE state.
- Baselines stored under DATA_DIR/visual-baselines so Docker volume persistence preserves them across deployments.
- Reset Visual Baselines control; the next run establishes new baselines.
- Visual monitoring can be enabled/disabled in Settings.

## Branding
- Added Next.js App Router favicon (`app/icon.svg`) using the JTS forest green and a simple paw mark.

## Preserved from v1.5
- Six functional synthetic checks.
- Browser/network diagnostics and web performance metrics.
- Alerts, incidents, SLA/SLO reporting, retention and port 3011 Docker deployment.
- Playwright 1.63.0 / v1.63.0-noble alignment and better-sqlite3 build/runtime fixes.

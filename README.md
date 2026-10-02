# JTS Synthetic Monitoring v1.5

v1.5 adds browser-level diagnostics and root-cause evidence to the existing JTS synthetic observability platform.

## v1.5 additions
- Browser console error capture per synthetic check.
- Failed network request capture.
- HTTP 4xx/5xx response capture.
- Browser performance metrics: TTFB, FCP, LCP, CLS and observed INP.
- Per-run root-cause inspection page.
- Diagnostics view for recent failed checks.
- Existing screenshots, video and Playwright traces remain captured.
- Additive SQLite migration preserves existing v1.4 data.

The six v1.4 production synthetic checks, SLA/SLO reporting, alerting, retention, Docker port 3011 and Playwright 1.63.0 baseline are retained.

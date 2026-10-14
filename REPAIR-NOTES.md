# Photo retrieval repair (not deployed)

The Railway production service is in harmonious-intuition / production, with an existing volume mounted at /data. Do not create or replace that volume. The user's verified backup includes galleries.json (24 registrations), gallery-cache.json (25 cache entries), current-gallery.txt and the deployed server.js. Real backup data is not present in this checkout and is not used by tests.

- All photo retrieval routes share a bounded queue: one active Chromium, at most six distinct active/pending jobs per Node process. Matching URLs share their job. Each browser closes before the next starts, keeping idle browser memory at zero. A close failure stops further launches rather than risking accumulation.
- Cached views return immediately. Expired cache refreshes in the background. Forced refresh falls back to saved cache on errors. Empty retrieval results never replace valid cache. Expired Amazon image URLs can still fail to display until a successful refresh.
- Fonts/media are blocked during scraping; images, CSS and scripts stay enabled. Existing scroll completeness detection is preserved. Navigation/launch/collection are bounded. Resource diagnostics are best-effort, including cgroup PID and memory limits/events.
- /test now requires existing admin authentication; normal viewing remains public. Only Japanese Amazon Photos share URLs are accepted for scraping.
- Storage paths/schema remain unchanged by default. Writes use temporary files and rename within the same directory. These are atomic per file, not a multi-file transaction. Loaded JSON is validated; failed loading blocks writes to prevent replacement of unreadable data. Registration appends existing entries.
- DATA_DIR allows isolated local test storage (default /data). CHROMIUM_EXECUTABLE_PATH is an optional local runtime override; Railway's existing Playwright image should use its matching installed browser with no override.
- The queue is per Node process; the observed Railway service has one replica. Multiple replicas/processes would require shared concurrency and storage coordination.

Validation: `node --test test/*.test.js`. The browser fixture test uses /usr/bin/chromium by default; set TEST_CHROMIUM_PATH to a browser available on the test machine. It maps navigation to an isolated local fixture and does not access Amazon. Route/persistence tests use synthetic data in temporary directories.

Production Railway limits and actual Amazon shared album retrieval have not been verified with this revision. No push to main, deployment, production data writes, or environment changes are authorized before user review. Preserve the existing main auto-deployment configuration by keeping changes local until explicit authorization.

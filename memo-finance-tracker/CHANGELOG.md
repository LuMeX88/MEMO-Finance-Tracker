# Changelog

## 1.1.1 - 2026-06-23

- **Fix:** creating categories, projects, transactions and schedules failed
  behind Home Assistant ingress. The collection endpoints required a trailing
  slash and issued a 307 redirect whose absolute target dropped the ingress
  path, so the redirected request never reached the add-on. The endpoints now
  respond on the exact paths the UI calls — no redirect.
- **Fix:** the same redirect made category and transaction lists look empty,
  which is why *Suggested categories* and *Load demo data* appeared to do
  nothing and the *New category* / *New project* button showed up twice (the
  empty-state call-to-action stacked on the header button). All now behave.
- **Fix:** the bookings list ignored the month filter and pagination because
  the API used different query-parameter names; month navigation, the category
  filter and paging now work.
- **New:** a **Bookings** entry in the main menu opens the full transaction
  manager where every booking can be edited or deleted.
- **New:** clicking a slice or a row in *Reports → Expenses by Category* opens
  the bookings list filtered to that category.

## 1.1.0 - 2026-06-23

- **Settings → local AI toggle**: turn the embedded AI on or off at any time;
  the choice is persisted and the model is loaded/unloaded accordingly.
- **Settings → demo data**: one click loads a realistic ~3-month sample
  dataset (transactions, projects, schedules) and one click removes it again
  — only the demo entries are touched, never your own data.
- **Settings → suggested categories**: add a set of best-practice budgeting
  categories, or remove the unused ones again.
- **Embedded local AI** (optional, `ai_enabled`): Qwen2.5-0.5B runs inside the
  add-on for transaction auto-categorization, OCR cleanup and a monthly
  dashboard insight. No cloud, no Ollama; disable with `ai_enabled: false`.
- **Improved receipt scanning**: OpenCV pre-processing (grayscale, denoise,
  deskew, adaptive thresholding) plus separate **camera** and **file** actions.
- **CSV / PDF report export**, generated locally.
- **Version & build date** are now stamped from the build and shown under
  Settings → Info, with a direct link to the documentation.
- **Fix:** pin NumPy to the 1.26 line (and OpenCV to a matching build) so the
  add-on starts on older CPUs and on VMs with a generic CPU model, which
  previously crashed with `NumPy ... baseline optimizations (X86_V2)`.
- **Fix:** configure logging in Python instead of a uvicorn `--log-config`
  file, so a missing/invalid file can never stop the add-on from starting; all
  log lines now carry timestamps.

## 1.0.0

- Initial release of the **MEMO – Finance Tracker** Home Assistant add-on.
- Web UI served securely through Home Assistant **ingress** (no extra port).
- Optional **MQTT Discovery** sensors: income, expenses, balance and
  transaction count for the current month.
- MQTT credentials can be inherited automatically from the Home Assistant
  MQTT service (Mosquitto broker add-on).
- Persistent **SQLite** database stored on the add-on `/data` volume.

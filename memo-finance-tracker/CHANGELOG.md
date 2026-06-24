# Changelog

## 1.2.2 - 2026-06-24

- **New – Allocate project task costs to a category:** each project task can now
  be assigned a **category**. When the task is booked, its mirrored expense
  booking is filed under that category instead of always landing in *Other* — so
  the **Expenses by Category** report finally splits project costs correctly.
  Re-categorising a task re-files its booking; leaving it empty keeps the old
  *Other* default. Editing the booking's category by hand is still respected.
- **New – Estimated completion date for Kanban tasks:** Kanban task cards now
  have an **estimated completion date**, shown on the card while the task is
  still a forecast.
- **New – Projects appear in the Ausgaben-Forecast:** planned (not-yet-booked)
  task costs are now projected into the **expense forecast** in the month of
  their estimated completion date, with a dedicated *Projekte (geplant)* row in
  the next-month breakdown. Overdue-but-unbooked costs roll into the current
  month so they are never lost. (Tasks without a date are not time-forecast.)
- **Fix:** one of the icons in the icon picker was broken and showed a blank/
  replacement glyph; it now renders correctly.

## 1.2.1 - 2026-06-24

- **Fix – Project costs now flow into the rest of the app:** the cost of a
  **booked** task (a Kanban task in a *Done* column, or a Waterfall task whose
  planned end date has passed) is now mirrored into a real **expense booking**
  linked to the project. As a result those costs finally appear where you would
  expect them:
  - in the **Bookings** overview (and they count towards reports), and
  - in the **budget bar on the main Projects page**, which previously stayed at
    €0 even after a project's budget was allocated and tasks were booked.
  - Forecast (not-yet-booked) tasks stay out of your bookings; their planned
    amount is now shown as a **Forecast** badge on each project card, while
    booked amounts show as a **Booked** badge.
  - The mirrored bookings stay in sync automatically: moving a task in/out of a
    *Done* column, changing its cost, or a Waterfall end date passing all update
    or remove the booking. Deleting a task or project removes its booking too.
    The booking's category stays editable — re-file it and it will be kept.
- **Fix:** selecting an icon while creating or editing a project did not always
  apply (duplicate emoji entries collided in the picker); icon selection now
  works reliably, including from the search results.
- **Fix:** creating a project now opens it straight away so a new **Waterfall**
  (or Kanban) project is immediately visible and usable.

## 1.2.0 - 2026-06-23

- **New – Project management & cost control:** clicking a project now opens a
  full detail view that combines task planning with automatic forecast vs.
  actual cost tracking.
  - **Kanban mode:** organise tasks in freely configurable columns (default
    *To Do*, *In Progress*, *Done*). Drag tasks between columns or move them
    with the on-card arrows. A task's cost counts as a **forecast** until the
    task reaches a column flagged as *Done*, where it switches to **booked**
    (actual) cost.
  - **Waterfall mode:** give each task a planned start/end date and a cost.
    The cost stays a **forecast** while today is before the planned end date
    and automatically becomes **booked** once the end date has passed.
  - The project header shows forecast, booked, planned-total and the real
    amount already spent (from linked bookings) against the budget.
- **New – Bookings filters:** the bookings list can now be filtered by type,
  category, project and recipient / merchant.
- **New – Flexible time ranges:** browse bookings by **month, quarter or year**,
  or pick a **custom date range**; the activity heatmap on the projects page is
  now clickable and jumps to the bookings of the selected day.
- **Fix:** the *Bookings* page showed the round **+** button twice (the global
  quick-add button overlapped a page-local one); only the global one remains.

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

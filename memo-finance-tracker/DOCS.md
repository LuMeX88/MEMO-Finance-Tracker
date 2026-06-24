# MEMO – Finance Tracker

Local-first personal finance tracker for Home Assistant. The full web UI is
served through **ingress**, your monthly finance metrics are published to
Home Assistant as **MQTT sensors**, and an optional **embedded AI** adds smart
categorization and insights – all running 100% on your own hardware.

## Features

- **Dashboard, transactions, schedules, projects and reports** for day-to-day
  money management.
- **Project management** — plan work as a **Kanban** board or a **Waterfall**
  timeline, set a budget, and track *forecast* vs *booked* costs. Each task cost
  can be filed under a **category** and is projected into the expense forecast by
  its estimated completion date.
- **Forecasting** of monthly, quarterly and yearly expenses (including planned
  project task costs).
- **CSV / PDF export** of reports, generated locally in your browser.
- **Receipt scanning (OCR)** via camera or file upload. A fast local Tesseract +
  OpenCV baseline always works; with the optional AI enabled, a vision model
  reads the amount, date and merchant straight from the photo.
- **Optional embedded AI** (Qwen2.5-VL-3B vision model) for receipt reading,
  auto-categorization and a short monthly insight – no cloud, no Ollama, **off by
  default**. Turn it on in Settings (a popup shows the system requirements).
- **Self-service tools in Settings**: load/remove **demo data**, add/remove
  **suggested best-practice categories**, and **backup/restore** all data as JSON.
- **MQTT sensors** for income, expenses, balance and transaction count.
- **German & English**, light & dark mode.

## Screenshots

![Reports overview](https://raw.githubusercontent.com/LuMeX88/MEMO-Finance-Tracker/main/images/screenshot-reports.png)

![Transactions](https://raw.githubusercontent.com/LuMeX88/MEMO-Finance-Tracker/main/images/screenshot-transactions.png)

![Projects (Kanban / Waterfall) with activity heatmap](https://raw.githubusercontent.com/LuMeX88/MEMO-Finance-Tracker/main/images/screenshot-projects.png)

![Settings with the local AI toggle](https://raw.githubusercontent.com/LuMeX88/MEMO-Finance-Tracker/main/images/screenshot-settings.png)

## Prerequisites

- A working **MQTT broker** — the official **Mosquitto broker** add-on is
  recommended.
- The **MQTT integration** configured in Home Assistant
  (Settings → Devices & Services → MQTT).

## Installation

1. In Home Assistant go to **Settings → Add-ons → Add-on Store**.
2. Open the three-dot menu → **Repositories** and add:
   `https://github.com/LuMeX88/MEMO-Finance-Tracker`
3. Install **MEMO – Finance Tracker** from the store.
4. Adjust the configuration (see below) and **Start** the add-on.
5. Open the UI from the sidebar (ingress) or the add-on **Open Web UI** button.

## Configuration

| Option | Description | Default |
| ------ | ----------- | ------- |
| `ai_enabled` | Enable the embedded local **vision** AI (receipt reading, auto-categorization, monthly insight). **Off by default** — enabling triggers a one-time ~2.8 GB model download and needs ~4 GB free RAM. Can also be toggled in **Settings**. | `false` |
| `mqtt_host` | Hostname of the MQTT broker | `core-mosquitto` |
| `mqtt_port` | MQTT broker port | `1883` |
| `mqtt_username` | MQTT username (leave empty to inherit from the MQTT service) | _empty_ |
| `mqtt_password` | MQTT password (leave empty to inherit from the MQTT service) | _empty_ |
| `mqtt_base_topic` | Base topic for state/availability | `memo` |
| `mqtt_discovery_prefix` | Home Assistant MQTT discovery prefix | `homeassistant` |
| `mqtt_currency` | Currency symbol used as the sensor unit | `€` |
| `mqtt_publish_interval` | Seconds between metric updates | `300` |

> Leave `mqtt_username` and `mqtt_password` **empty** to automatically use the
> credentials provided by the Mosquitto broker add-on.

## Sensor entities

The add-on creates a device named **MEMO Finance Tracker** with these sensors:

- `sensor.memo_income_this_month`
- `sensor.memo_expenses_this_month`
- `sensor.memo_balance_this_month`
- `sensor.memo_transactions_this_month`

## Data & backups

All data is stored in a SQLite database at `/data/memo.db`, which is included
in Home Assistant snapshots/backups of the add-on.

## Receipt scanning (OCR)

Open a transaction and use **Take photo** to capture a receipt with your device
camera, or **Choose file** to pick an existing image. The image is processed
locally with Tesseract OCR and OpenCV (grayscale, denoise, deskew, adaptive
thresholding) and the detected **amount**, **date** and **recipient** are filled
in as a suggestion – always review them before saving. When the optional local
AI is enabled, the receipt is additionally read by a **vision model** for
noticeably better accuracy (see **Local AI** below).

> In the Home Assistant Companion app the camera and the file picker are offered
> as two separate actions, so both work reliably.

## Local AI (optional)

MEMO can run a small **vision** language model **inside the add-on** – no external
service. It is **off by default**; enable it in the configuration or via
**Settings → AI (local)** (a popup shows the system requirements first).

- **Model:** Qwen2.5-VL-3B-Instruct (GGUF, Q4_K_M, ~1.9 GB) plus its vision
  encoder / mmproj (~850 MB) via `llama.cpp` on CPU.
- **Download:** happens **on demand** the moment you enable the AI — into
  `/data/models` (~2.8 GB total), with a live **progress bar** in
  **Settings → AI (local)**. This keeps the initial install fast and makes the AI
  a deliberate choice. It is the only network access the AI needs; all inference
  is local, and the download runs in the background without blocking startup.
- **Features:** **receipt reading** (amount, date & merchant straight from the
  photo), auto-categorization of new transactions, and an **AI Insight** card on
  the dashboard summarizing the last 30 days.
- **Disable:** set `ai_enabled: false`, or use the **AI (local)** toggle under
  **Settings**. Receipt scanning then falls back to the fast Tesseract OCR and
  the rest of the app keeps working.

### System requirements

| Resource | Recommended |
| -------- | ----------- |
| Free RAM | ~4 GB (the 3B model needs ~3.5 GB while loaded) |
| CPU | 64-bit with **AVX2** (on Proxmox set the VM CPU type to **host**) |
| Disk | ~3 GB free in `/data` for the one-time download |

> ⏱️ **It can be slow.** Depending on your hardware, the first model load and
> every AI action can take noticeably longer – on weak CPUs up to a minute per
> receipt. The receipt-scan AI step is time-boxed and falls back to the fast
> Tesseract result if it runs long. If your hardware is limited, keep AI **off**.

## Settings

The **Settings** page offers a few self-service tools:

- **AI (local)** – turn the embedded AI on or off at any time. Enabling it shows
  the system requirements, then downloads the model on demand with a **progress
  bar** and loads it; disabling unloads it. The choice is saved across restarts.
- **Demo data** – **Load demo data** fills the app with a realistic ~3-month
  sample (transactions, projects and schedules) so you can explore every
  feature; **Erase demo data** removes only those sample entries and never
  touches data you created yourself.
- **Suggested categories** – **Add categories** inserts a set of best-practice
  budgeting categories (existing ones are kept); **Remove suggested** deletes
  the suggested categories again, skipping any that are still in use.
- **Backup & Restore** – download all data as a JSON file and import it later.

## Version

The current version and build date are shown under **Settings → Info** in the
app. They are stamped from the build, so they always match the installed release.

## Troubleshooting

- **No sensors in Home Assistant** – make sure the **Mosquitto broker** add-on and
  the **MQTT integration** are installed and running, then restart MEMO.
- **"OCR not available"** – the OCR engine failed to start; restart the add-on and
  check the logs.
- **AI never becomes ready** – the first model download needs internet and a few
  hundred MB of free space in `/data`. Check the add-on log for `[MEMO AI]`
  messages, or set `ai_enabled: false` to disable it.

## Tested environments

The UI is actively tested on **Google Chrome** and **Microsoft Edge** (desktop)
and the **Home Assistant Companion app on Android**. Other modern browsers
should work but are not regularly tested. In-app receipt capture requires the
Companion app to have camera permission for its webview.

## Privacy

local. private. yours. MEMO has no accounts, no telemetry and no cloud sync.
The only outbound request is the one-time AI model download (when AI is enabled).

## Support

MEMO is free and open-source. If it helps you stay on top of your finances,
consider buying me a coffee — it genuinely helps and is hugely appreciated.

<a href="https://www.buymeacoffee.com/LuMeX88" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="60"></a>

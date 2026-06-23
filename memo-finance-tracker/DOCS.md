# MEMO – Finance Tracker

Local-first personal finance tracker for Home Assistant. The full web UI is
served through **ingress**, your monthly finance metrics are published to
Home Assistant as **MQTT sensors**, and an optional **embedded AI** adds smart
categorization and insights – all running 100% on your own hardware.

## Features

- **Dashboard, transactions, schedules, projects and reports** for day-to-day
  money management.
- **Forecasting** of monthly, quarterly and yearly expenses.
- **CSV / PDF export** of reports, generated locally in your browser.
- **Receipt scanning (OCR)** via camera or file upload, with local Tesseract +
  OpenCV pre-processing.
- **Optional embedded AI** (Qwen2.5-0.5B) for auto-categorization, OCR cleanup
  and a short monthly insight – no cloud, no Ollama.
- **MQTT sensors** for income, expenses, balance and transaction count.
- **German & English**, light & dark mode.

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
| `ai_enabled` | Enable the embedded local AI (auto-categorization, OCR cleanup, monthly insight). Set to `false` to disable it and skip the one-time model download. | `true` |
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
in as a suggestion – always review them before saving.

> In the Home Assistant Companion app the camera and the file picker are offered
> as two separate actions, so both work reliably.

## Local AI (optional)

MEMO can run a small language model **inside the add-on** – no external service:

- **Model:** Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M, ~400 MB) via `llama.cpp` on CPU.
- **Download:** happens once on first start into `/data/models`. This is the only
  network access the AI needs; all inference is local. It runs in the background
  and never blocks startup.
- **Features:** auto-categorization of new transactions, OCR cleanup, and an
  **AI Insight** card on the dashboard summarizing the last 30 days.
- **Disable:** set `ai_enabled: false`. All AI features then degrade gracefully.

> On low-power devices (e.g. a Raspberry Pi) AI responses can take a few seconds.

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

## Privacy

local. private. yours. MEMO has no accounts, no telemetry and no cloud sync.
The only outbound request is the one-time AI model download (when AI is enabled).

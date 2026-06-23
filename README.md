# MEMO – Finance Tracker
### *own your finances*

> **MEMO** stands for **M**oney & **E**xpense **M**anagement **O**verview

A modern, lightweight personal finance tracker that runs as a **Home Assistant add-on**. MEMO runs 100% locally – no cloud, no subscriptions, no external dependencies. Just you and your money. Key metrics are published straight into Home Assistant as sensors over **MQTT**, so you can build dashboards and automations around your finances.

---

## ⚠️ Prerequisites

MEMO integrates with Home Assistant through **MQTT**. Before installing, make sure you have:

| Requirement | Notes |
|---|---|
| **Home Assistant OS or Supervised** | Required to install add-ons. |
| **MQTT broker — [Mosquitto add-on](https://github.com/home-assistant/addons/tree/master/mosquitto)** | **Required.** Install *Mosquitto broker* from **Settings → Add-ons → Add-on Store** and start it. |
| **MQTT integration enabled** | **Settings → Devices & Services → Add Integration → MQTT**, pointed at your broker. This is what turns MEMO's published topics into sensor entities via MQTT Discovery. |
| **MQTT user / credentials** | Create a Home Assistant user (or Mosquitto local user) for MEMO to authenticate against the broker. |

> Without a running MQTT broker (Mosquitto) and the MQTT integration, MEMO still works as a finance app, but **no Home Assistant sensor entities will be created**.

---

## Why MEMO?

Most finance apps live in the cloud, share your data, and cost a monthly fee. MEMO is different. It runs on your own hardware, stores everything locally in SQLite, and integrates natively with Home Assistant — including single sign-on through the Home Assistant sidebar (Ingress). Your data never leaves your home.

---

## Features

- **Dashboard** – Real-time overview of income, expenses, balance and trends
- **Transactions** – Log income and expenses with category, recipient, payment method and optional notes
- **Schedules** – Manage recurring costs (rent, subscriptions, utilities) with fixed or variable amounts
- **Forecasting** – Automatic monthly, 3-month and yearly expense forecast based on schedules and spending averages
- **Reports & Export** – Total income, total expenses, monthly averages, biggest transactions, period comparisons and one-click **CSV / PDF export** (generated locally)
- **Categories & Projects** – Fully customizable categories with icons and colors, project budgets with progress tracking
- **Receipt Scanning (OCR)** – Capture a receipt with your **camera** or pick an existing **image file**. Tesseract OCR with OpenCV pre-processing runs locally and auto-fills amount, date and recipient as a suggestion
- **Embedded Local AI** *(optional)* – A tiny local language model (Qwen2.5-0.5B, ~400 MB) runs **inside the add-on** – no Ollama, no cloud. It auto-categorizes new transactions, cleans up noisy OCR results and writes a short monthly spending insight. Can be **switched on/off right from Settings** (or via the configuration)
- **Smart Schedule Suggestions** – The app detects recurring patterns in your transactions and suggests turning them into schedules automatically
- **Demo data & suggested categories** – One-click **load/remove sample data** to explore the app and **add best-practice budgeting categories** (or remove the unused ones), all from **Settings**
- **Backup & Restore** – Download all your data as JSON and restore it again
- **MQTT Sensor Entities** – Key metrics published to Home Assistant via MQTT Discovery (see below)
- **Home Assistant Ingress** – Open MEMO straight from the HA sidebar; authentication handled by Home Assistant
- **Multilingual** – German and English
- **Light / Dark Mode**

---

## Installation (Home Assistant add-on)

1. In Home Assistant, go to **Settings → Add-ons → Add-on Store**.
2. Open the **⋮ menu (top-right) → Repositories**, paste this repository URL and click **Add**:
   ```
   https://github.com/LuMeX88/MEMO-Finance-Tracker
   ```
3. Install the **MEMO – Finance Tracker** add-on from the store.
4. Open the add-on **Configuration** tab and enter your MQTT broker details (see below).
5. **Start** the add-on, then click **Open Web UI** (or use the MEMO entry in the sidebar).

> Make sure the **Mosquitto broker** add-on is installed and running **before** starting MEMO (see [Prerequisites](#️-prerequisites)).

---

## Configuration

The add-on exposes the following options:

| Option | Default | Description |
|---|---|---|
| `ai_enabled` | `true` | Enable the embedded local AI (auto-categorization, OCR cleanup, monthly insight). Set to `false` to disable it and skip the one-time model download. |
| `mqtt_host` | `core-mosquitto` | Hostname of your MQTT broker. Use `core-mosquitto` for the official Mosquitto add-on. |
| `mqtt_port` | `1883` | MQTT broker port. |
| `mqtt_username` | – | MQTT username (a Home Assistant / Mosquitto user). |
| `mqtt_password` | – | MQTT password. |
| `mqtt_base_topic` | `memo` | Base topic MEMO publishes to. |
| `mqtt_discovery_prefix` | `homeassistant` | Home Assistant MQTT Discovery prefix. |
| `mqtt_currency` | `€` | Currency unit used for the monetary sensors. |
| `mqtt_publish_interval` | `300` | How often (in seconds) metrics are re-published. |

The SQLite database is stored in the add-on's persistent `/data` volume and is included in Home Assistant backups.

---

## Home Assistant Sensor Entities

Once MQTT is configured, MEMO registers a **MEMO Finance Tracker** device with these sensors via MQTT Discovery:

```yaml
sensor.memo_income_this_month          # device_class: monetary
sensor.memo_expenses_this_month        # device_class: monetary
sensor.memo_balance_this_month         # device_class: monetary
sensor.memo_transactions_this_month    # count of transactions this month
```

These can be used directly in dashboards, history graphs and automations (e.g. "notify me when monthly expenses exceed €X").

---

## Local AI (optional, 100% on-device)

MEMO ships with a small embedded language model so smart features work **without any cloud service or separate Ollama container**:

- **Model:** Qwen2.5-0.5B-Instruct (GGUF, Q4_K_M, ~400 MB) running via `llama.cpp` on CPU.
- **First start:** the model is downloaded once into the persistent `/data/models` volume. This is the **only** time MEMO touches the network for AI; all inference happens locally afterwards. The download runs in the background and never blocks the app.
- **What it does:**
  - **Auto-categorization** – when you add a transaction without picking a category, the model suggests the best-matching one (falling back to a default if unsure).
  - **OCR cleanup** – when receipt scanning is unsure about a field, the model helps recover the amount, date or merchant from the raw text.
  - **Monthly insight** – an "AI Insight" card on the dashboard summarizes the last 30 days in two or three sentences with one saving tip.
- **Disable it:** set `ai_enabled: false` in the add-on configuration, or use the **AI (local)** toggle under **Settings**. Every AI feature then degrades gracefully and the rest of the app keeps working.

> On low-power hardware (e.g. a Raspberry Pi) responses can take a few seconds. If you don't want the model at all, keep `ai_enabled` off.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (serves both the REST API and the built frontend) |
| Database | SQLite (local, in `/data`) |
| OCR | Tesseract via pytesseract + OpenCV pre-processing + Pillow |
| Local AI | llama.cpp (`llama-cpp-python`) + Qwen2.5-0.5B-Instruct GGUF |
| Pattern Matching | rapidfuzz |
| HA Integration | MQTT Discovery (paho-mqtt) + Ingress |
| Auth | Home Assistant (via Ingress) |

The add-on runs as a **single container**: FastAPI serves the compiled React app and the API on one port, which Home Assistant exposes through Ingress.

---

## Development / Standalone

MEMO can also run outside Home Assistant for development.

**Docker (standalone):**
```bash
docker compose up --build
# frontend: http://localhost:3000   backend: http://localhost:8000
```

**Local dev (hot reload):**
```bash
# Backend
cd backend
python -m uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api to :8000)
```

To enable MQTT in standalone/dev mode, copy `backend/.env.example` to `backend/.env` and set `MQTT_HOST` (and credentials). If `MQTT_HOST` is empty, the MQTT feature stays disabled and the app runs normally.

---

## Philosophy

> local. private. yours.

MEMO is built on the belief that your financial data belongs to you and only you. No accounts, no sync, no telemetry. Everything runs on your own machine, backed up with your Home Assistant backup.

---

## License

GNU GENERAL PUBLIC LICENSE Version 3

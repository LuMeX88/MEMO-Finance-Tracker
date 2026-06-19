# MEMO – Finance Tracker
### *own your finances*

> **MEMO** stands for **M**oney & **E**xpense **M**anagement **O**verview

A modern, lightweight personal finance tracker built as a standalone web app, designed to be fully integrated into [Home Assistant](https://www.home-assistant.io/). MEMO runs 100% locally – no cloud, no subscriptions, no external dependencies. Just you and your money.

---

## Why MEMO?

Most finance apps live in the cloud, share your data, and cost a monthly fee. MEMO is different. It runs on your own hardware, stores everything locally in SQLite, and integrates natively with Home Assistant's user management. Your data never leaves your home.

---

## Features

- **Dashboard** – Real-time overview of income, expenses, balance and trends
- **Transactions** – Log income and expenses with category, recipient, payment method and optional notes
- **Schedules** – Manage recurring costs (rent, subscriptions, utilities) with fixed or variable amounts
- **Forecasting** – Automatic monthly, 3-month and yearly expense forecast based on schedules and spending averages
- **Reports** – Total income, total expenses, monthly averages, biggest transactions and period comparisons
- **Categories & Projects** – Fully customizable categories with icons and colors, project budgets with progress tracking
- **Transaction Calendar** – Heatmap-style calendar view of all transactions
- **OCR Receipt Scanning** – Photograph receipts directly in the app. Tesseract OCR runs locally and auto-fills amount, date and recipient as a suggestion
- **Smart Schedule Suggestions** – The app detects recurring patterns in your transactions and suggests turning them into schedules automatically
- **HA Sensor Entities** – Key metrics exposed as Home Assistant sensors for dashboards and automations
- **Multi-user** – Access control via Home Assistant's built-in user management
- **Export** – CSV and PDF export for reports and tax purposes
- **Multilingual** – German and English
- **Light / Dark Mode**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Mobile-first, Tailwind CSS |
| Backend | Python, REST API |
| Database | SQLite (local, on HA server) |
| OCR | Tesseract via pytesseract + Pillow |
| Pattern Matching | rapidfuzz |
| Integration | Home Assistant Custom Component |
| Auth | Home Assistant User Management |

> The app is built as a standalone web app first, with clean separation of concerns so the Home Assistant integration requires no major refactoring.

---

## Home Assistant Sensor Entities

```yaml
sensor.memo_expenses_this_month
sensor.memo_income_this_month
sensor.memo_balance_this_month
sensor.memo_expenses_today
sensor.memo_last_transaction_amount
sensor.memo_last_transaction_recipient
sensor.memo_budget_remaining_[category]
sensor.memo_next_scheduled_expense
sensor.memo_scheduled_expenses_this_month
```

---

## Roadmap

- [x] Core transaction management
- [x] Schedules & forecasting
- [x] OCR receipt scanning (local, Tesseract)
- [x] Smart schedule suggestions
- [x] HA sensor entities
- [?] Savings goals
- [?] Multi-account / wallet support
- [?] Household splitting (shared expenses)


---

## Philosophy

> local. private. yours.

MEMO is built on the belief that your financial data belongs to you and only you. No accounts, no sync, no telemetry. Everything runs on your own machine, backed up with your Home Assistant backup.

---

## License

MIT

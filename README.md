# HA-Budgeting

> Personal Expenses Management Tool — Standalone Web App (MVP), HA-ready

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| State / Data | Zustand + TanStack Query v5 |
| Charts | Recharts |
| Backend | FastAPI + SQLAlchemy |
| Database | SQLite |
| Containerization | Docker + docker-compose |

---

## Project Structure

```
HA-Budgeting/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app, CORS, startup seed
│   │   ├── database.py       # SQLAlchemy engine + session
│   │   ├── models/           # ORM models (Category, Project, Transaction, Schedule)
│   │   ├── schemas/          # Pydantic v2 schemas
│   │   └── routers/          # API endpoints
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/            # Dashboard, Schedules, Reports, CategoriesPage, Settings, Transactions
│   │   ├── components/
│   │   │   ├── layout/       # AppLayout (sidebar + bottom nav)
│   │   │   ├── transactions/ # TransactionForm, QuickAddModal, TransactionList
│   │   │   └── ui/           # Button, Input, Select, Modal, Toast, EmptyState
│   │   ├── lib/
│   │   │   ├── api.ts        # Typed fetch API client
│   │   │   └── utils.ts      # cn(), formatCurrency(), formatDate(), getDaysUntil()
│   │   ├── store/
│   │   │   ├── useSettingsStore.ts  # currency, language, theme (persisted)
│   │   │   └── useUIStore.ts        # quickAdd, toasts
│   │   └── types/index.ts    # All TypeScript interfaces
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml
```

---

## Getting Started (Development)

### Prerequisites
- Python 3.11+
- Node.js 20+

### Backend

```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
# API: http://localhost:8000
# Swagger docs: http://localhost:8000/docs
```

On first start, 8 default categories (Food & Drinks, Transport, Housing, ...) are seeded automatically.

### Frontend

```powershell
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000/api/v1
```

---

## Running with Docker

```powershell
docker-compose up --build
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
```

SQLite data is persisted in a Docker volume (`sqlite_data`).

---

## API Reference

Base URL: `http://localhost:8000/api/v1`

| Method | Path | Description |
|---|---|---|
| GET/POST | `/transactions` | List (filterable) + create |
| GET/PUT/DELETE | `/transactions/{id}` | Detail, update, delete |
| GET/POST | `/categories` | List + create |
| GET/PUT/DELETE | `/categories/{id}` | Detail, update, delete |
| GET/POST | `/projects` | List + create |
| GET/PUT/DELETE | `/projects/{id}` | Detail, update, delete |
| GET/POST | `/schedules` | List + create |
| GET/PUT/DELETE | `/schedules/{id}` | Detail, update, delete |
| GET | `/reports/summary` | KPI summary (date_from, date_to) |
| GET | `/reports/by-category` | Expenses per category |
| GET | `/reports/timeline` | Daily income/expense timeline |
| GET | `/reports/comparison` | Current vs previous vs same month last year |

---

## Features

### Dashboard
- KPI cards: expenses, income, balance, avg/transaction
- Trend chart: this week vs last week
- Category budget progress bars
- Recent transactions list
- Quick-Add FAB (opens fast transaction entry modal)

### Schedules (Recurring Costs)
- Fixed or variable amounts
- Weekly / Monthly / Yearly intervals
- Countdown to next due date
- Forecasting: 1 / 3 / 12 month preview with bar chart

### Reports
- Configurable date range
- Category donut chart
- Timeline bar chart
- Month-over-month comparison
- CSV + PDF export

### Categories & Projects
- Custom icon (emoji) + color per category
- Archive instead of delete
- Projects with optional budget + end date
- Budget progress tracking
- Activity heatmap (GitHub-style, last 12 months)

### Settings
- Currency: CHF / EUR / USD / GBP
- Language: Deutsch / English
- Theme: Light / Dark
- Default category
- Data export (JSON / CSV)

---

## Roadmap

### Phase 2 — Home Assistant Integration
- FastAPI backend packaged as HA Custom Component (HACS)
- HA Sensors: `sensor.expenses_this_month`, `sensor.income_this_month`, `sensor.balance_this_month`, `sensor.expenses_today`, `sensor.last_transaction_amount`, `sensor.budget_remaining_[category]`, `sensor.next_scheduled_expense`
- HA authentication (no separate login needed)
- Lovelace card for quick transaction entry

---

## License

MIT

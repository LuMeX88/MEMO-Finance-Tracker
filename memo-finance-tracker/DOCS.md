# MEMO – Finance Tracker

Local-first personal finance tracker for Home Assistant. The full web UI is
served through **ingress**, and your monthly finance metrics are published to
Home Assistant as **MQTT sensors**.

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

"""Optional MQTT Discovery publisher.

Exposes MEMO finance metrics as Home Assistant sensors via the MQTT Discovery
protocol. This is an *optional* feature, following the same graceful-degradation
pattern used elsewhere in the project: if ``paho-mqtt`` is not installed or no
``MQTT_HOST`` is configured, the publisher stays disabled and the rest of the
application runs completely unchanged.

Sensors are grouped under a single Home Assistant *device* ("MEMO Finance
Tracker") and share one retained JSON state topic to keep broker traffic low.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date
from typing import Optional

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.transaction import Transaction, TransactionType

try:  # Graceful import – mirrors the rapidfuzz pattern in pattern_detector.py
    import paho.mqtt.client as mqtt

    PAHO_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only without the dependency
    PAHO_AVAILABLE = False

logger = logging.getLogger("memo.mqtt")


# ---------------------------------------------------------------------------
# Sensor catalogue – each entry becomes one Home Assistant sensor entity.
# "monetary" sensors get device_class=monetary + the configured currency unit.
# ---------------------------------------------------------------------------
SENSORS = [
    {"id": "income_this_month", "name": "MEMO Income This Month", "monetary": True},
    {"id": "expenses_this_month", "name": "MEMO Expenses This Month", "monetary": True},
    {"id": "balance_this_month", "name": "MEMO Balance This Month", "monetary": True},
    {
        "id": "transactions_this_month",
        "name": "MEMO Transactions This Month",
        "icon": "mdi:swap-horizontal",
        "state_class": "total",
    },
]


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(name)
    return value if value not in (None, "") else default


def _compute_metrics(db: Session) -> dict:
    """Aggregate the current calendar month's figures from the database."""
    today = date.today()
    txns = (
        db.query(Transaction)
        .filter(
            extract("year", Transaction.date) == today.year,
            extract("month", Transaction.date) == today.month,
        )
        .all()
    )
    income = sum(t.amount for t in txns if t.type == TransactionType.income)
    expenses = sum(abs(t.amount) for t in txns if t.type == TransactionType.expense)
    return {
        "income_this_month": round(income, 2),
        "expenses_this_month": round(expenses, 2),
        "balance_this_month": round(income - expenses, 2),
        "transactions_this_month": len(txns),
    }


class MqttPublisher:
    """Publishes MEMO metrics to an MQTT broker using HA Discovery."""

    def __init__(self) -> None:
        self.host = _env("MQTT_HOST")
        self.port = int(_env("MQTT_PORT", "1883"))
        self.username = _env("MQTT_USERNAME") or _env("MQTT_USER")
        self.password = _env("MQTT_PASSWORD")
        self.discovery_prefix = _env("MQTT_DISCOVERY_PREFIX", "homeassistant")
        self.base_topic = _env("MQTT_BASE_TOPIC", "memo")
        self.currency = _env("MQTT_CURRENCY", "€")
        self.publish_interval = int(_env("MQTT_PUBLISH_INTERVAL", "300"))

        self.state_topic = f"{self.base_topic}/state"
        self.availability_topic = f"{self.base_topic}/status"

        self._client = None
        self._connected = False

    @property
    def enabled(self) -> bool:
        return PAHO_AVAILABLE and bool(self.host)

    # -- lifecycle ----------------------------------------------------------
    def connect(self) -> bool:
        if not self.enabled:
            return False
        try:
            client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id="memo-finance-tracker",
            )
            if self.username:
                client.username_pw_set(self.username, self.password)
            client.will_set(self.availability_topic, "offline", retain=True)
            client.on_connect = self._on_connect
            client.on_disconnect = self._on_disconnect
            client.connect(self.host, self.port, keepalive=60)
            client.loop_start()
            self._client = client
            logger.info("MQTT publisher connecting to %s:%s", self.host, self.port)
            return True
        except Exception:  # pragma: no cover - network failure path
            logger.exception("MQTT connection failed; feature disabled this run")
            self._client = None
            return False

    def disconnect(self) -> None:
        if not self._client:
            return
        try:
            self._client.publish(self.availability_topic, "offline", retain=True)
            self._client.loop_stop()
            self._client.disconnect()
        except Exception:  # pragma: no cover
            logger.debug("Error during MQTT disconnect", exc_info=True)
        finally:
            self._client = None
            self._connected = False

    # -- callbacks ----------------------------------------------------------
    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            self._connected = True
            client.publish(self.availability_topic, "online", retain=True)
            self.publish_discovery()
            self.publish_state()
            logger.info("MQTT connected; discovery + initial state published")
        else:
            logger.warning("MQTT connection refused (reason_code=%s)", reason_code)

    def _on_disconnect(self, client, userdata, *args):
        self._connected = False
        logger.info("MQTT disconnected")

    # -- publishing ---------------------------------------------------------
    def publish_discovery(self) -> None:
        if not self._client:
            return
        device = {
            "identifiers": ["memo_finance_tracker"],
            "name": "MEMO Finance Tracker",
            "manufacturer": "MEMO",
            "model": "Finance Tracker",
        }
        for sensor in SENSORS:
            object_id = sensor["id"]
            config = {
                "name": sensor["name"],
                "unique_id": f"{self.base_topic}_{object_id}",
                "object_id": f"{self.base_topic}_{object_id}",
                "state_topic": self.state_topic,
                "value_template": "{{ value_json.%s }}" % object_id,
                "availability_topic": self.availability_topic,
                "device": device,
            }
            if sensor.get("monetary"):
                config["device_class"] = "monetary"
                config["unit_of_measurement"] = self.currency
                config["state_class"] = "total"
            if sensor.get("state_class"):
                config["state_class"] = sensor["state_class"]
            if sensor.get("icon"):
                config["icon"] = sensor["icon"]

            topic = (
                f"{self.discovery_prefix}/sensor/"
                f"{self.base_topic}/{object_id}/config"
            )
            self._client.publish(topic, json.dumps(config), retain=True)

    def publish_state(self, db: Optional[Session] = None) -> None:
        if not (self._client and self._connected):
            return
        owns_session = db is None
        if owns_session:
            db = SessionLocal()
        try:
            metrics = _compute_metrics(db)
        finally:
            if owns_session:
                db.close()
        self._client.publish(self.state_topic, json.dumps(metrics), retain=True)

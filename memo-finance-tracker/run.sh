#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

# Persistent SQLite database lives on the add-on /data volume
export DATABASE_URL="sqlite:////data/memo.db"

# --- Local AI (embedded llama.cpp) ---
# When disabled the model is never downloaded and all AI endpoints degrade
# gracefully (see backend/app/services/ai.py).
if bashio::config.true 'ai_enabled'; then
  export AI_ENABLED="true"
else
  export AI_ENABLED="false"
fi

# --- MQTT configuration from the add-on options ---
export MQTT_HOST="$(bashio::config 'mqtt_host')"
export MQTT_PORT="$(bashio::config 'mqtt_port')"
export MQTT_BASE_TOPIC="$(bashio::config 'mqtt_base_topic')"
export MQTT_DISCOVERY_PREFIX="$(bashio::config 'mqtt_discovery_prefix')"
export MQTT_CURRENCY="$(bashio::config 'mqtt_currency')"
export MQTT_PUBLISH_INTERVAL="$(bashio::config 'mqtt_publish_interval')"

# Credentials: an explicit username/password in the options always wins.
# Otherwise inherit them from the Home Assistant MQTT service (e.g. the
# Mosquitto broker add-on) when it is available.
if bashio::config.has_value 'mqtt_username'; then
  export MQTT_USERNAME="$(bashio::config 'mqtt_username')"
elif bashio::services.available 'mqtt'; then
  export MQTT_USERNAME="$(bashio::services 'mqtt' 'username')"
  export MQTT_PASSWORD="$(bashio::services 'mqtt' 'password')"
  bashio::log.info "Using MQTT credentials from the Home Assistant MQTT service."
fi

if bashio::config.has_value 'mqtt_password'; then
  export MQTT_PASSWORD="$(bashio::config 'mqtt_password')"
fi

bashio::log.info "Starting MEMO – Finance Tracker (MQTT host: ${MQTT_HOST}:${MQTT_PORT}, AI: ${AI_ENABLED})"

cd /app
exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8099

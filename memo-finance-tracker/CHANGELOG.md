# Changelog

## Unreleased

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

## 1.0.0

- Initial release of the **MEMO – Finance Tracker** Home Assistant add-on.
- Web UI served securely through Home Assistant **ingress** (no extra port).
- Optional **MQTT Discovery** sensors: income, expenses, balance and
  transaction count for the current month.
- MQTT credentials can be inherited automatically from the Home Assistant
  MQTT service (Mosquitto broker add-on).
- Persistent **SQLite** database stored on the add-on `/data` volume.

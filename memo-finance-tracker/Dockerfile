# MEMO – Finance Tracker — Home Assistant add-on image
# Build context = this add-on folder (memo-finance-tracker/)

# Global build arg (must be declared before the first FROM so it can be used by
# the runtime stage's FROM). The Supervisor overrides it per architecture.
ARG BUILD_FROM=ghcr.io/home-assistant/base:3.23

# ---------- Stage 1: build the React / Vite frontend ----------
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Bundle with Vite directly. Type-checking (tsc) is a dev/CI concern and is
# intentionally not run here so image builds never break on type-only errors.
RUN npx vite build

# ---------- Stage 2: runtime on the Home Assistant base image ----------
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

# Python runtime + Tesseract OCR engine and language data (English + German)
# for the optional receipt-scanning feature. On Alpine the engine and the
# trained language data are separate packages; without the *-data-* packages
# tesseract has zero languages and every OCR call fails ("OCR not available").
RUN apk add --no-cache \
        python3 \
        py3-pip \
        tesseract-ocr \
        tesseract-ocr-data-eng \
        tesseract-ocr-data-deu \
    && python3 -m venv "${VIRTUAL_ENV}"

WORKDIR /app

# Install Python dependencies first for better layer caching
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend application code
COPY backend/app ./app

# Compiled frontend, served by FastAPI as static files at /app/static
COPY --from=frontend /build/dist ./static

# Add-on entrypoint
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

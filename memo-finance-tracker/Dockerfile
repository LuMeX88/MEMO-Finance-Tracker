# MEMO – Finance Tracker — Home Assistant add-on image
# Build context = this add-on folder (memo-finance-tracker/)

# Global build arg (must be declared before the first FROM so it can be used by
# the runtime stage's FROM). The Supervisor overrides it per architecture using
# the build_from map in build.yaml (Debian base — needed for prebuilt
# opencv / llama-cpp-python wheels and apt tooling).
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm

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

# Version metadata baked in at build time so the app can report it fully offline.
# BUILD_VERSION is set automatically by the Supervisor from config.yaml; BUILD_DATE
# comes from build.yaml/CI (see backend/app/version.py).
ARG BUILD_VERSION=dev
ARG BUILD_DATE=unknown

ENV LANG=C.UTF-8 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    VIRTUAL_ENV=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    APP_VERSION=${BUILD_VERSION} \
    APP_BUILD_DATE=${BUILD_DATE}

# System packages:
#  - python3 + venv + pip       -> backend runtime
#  - tesseract-ocr + eng/deu    -> receipt OCR (engine + trained languages)
#  - libglib2.0-0               -> runtime lib for opencv-python-headless
#  - build-essential + cmake    -> compile llama-cpp-python (CPU-only)
# build-essential/cmake are purged again after the Python deps are compiled to
# keep the runtime image small (the compiled wheels live in the venv).
WORKDIR /app
COPY backend/requirements.txt ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-venv \
        python3-pip \
        tesseract-ocr \
        tesseract-ocr-eng \
        tesseract-ocr-deu \
        libglib2.0-0 \
        build-essential \
        cmake \
    && python3 -m venv "${VIRTUAL_ENV}" \
    && pip install --no-cache-dir --upgrade pip \
    && CMAKE_ARGS="-DGGML_BLAS=OFF -DGGML_CUDA=OFF" pip install --no-cache-dir -r requirements.txt \
    && apt-get purge -y --auto-remove build-essential cmake \
    && rm -rf /var/lib/apt/lists/*

# Backend application code
COPY backend/app ./app

# Compiled frontend, served by FastAPI as static files at /app/static
COPY --from=frontend /build/dist ./static

# Add-on entrypoint
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

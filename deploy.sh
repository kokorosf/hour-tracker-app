#!/usr/bin/env bash
#
# deploy.sh — Build, push, migrate, and deploy hour-tracker to GCP.
#
# Usage:
#   ./deploy.sh                       # full deploy (build + push + migrate + deploy)
#   ./deploy.sh --skip-build          # skip Docker build/push, just migrate + deploy
#   ./deploy.sh --migrate-only        # only run database migrations
#
# Required environment variables (or set in .env.production):
#   GCP_PROJECT_ID    — Google Cloud project ID
#   GCP_REGION        — Target region          (default: us-central1)
#   DB_HOST           — Database host IP
#   DB_PASSWORD       — Database password
#   IMAGE_TAG         — Docker image tag        (default: latest)

set -euo pipefail

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env.production if it exists
if [[ -f "${SCRIPT_DIR}/.env.production" ]]; then
  echo "Loading .env.production..."
  set -a
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env.production"
  set +a
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:?Error: GCP_PROJECT_ID is not set}"
GCP_REGION="${GCP_REGION:-us-central1}"
DB_HOST="${DB_HOST:?Error: DB_HOST is not set}"
DB_PASSWORD="${DB_PASSWORD:?Error: DB_PASSWORD is not set}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

IMAGE_NAME="gcr.io/${GCP_PROJECT_ID}/hour-tracker-web"
IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"

DB_USER="hourtracker_user"
DB_NAME="hourtracker"

# ──────────────────────────────────────────────
# Flags
# ──────────────────────────────────────────────

SKIP_BUILD=false
MIGRATE_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --skip-build)   SKIP_BUILD=true ;;
    --migrate-only) MIGRATE_ONLY=true ;;
    *)              echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ──────────────────────────────────────────────
# Helper functions
# ──────────────────────────────────────────────

log() { echo -e "\n\033[1;34m==>\033[0m \033[1m$*\033[0m"; }
err() { echo -e "\n\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

check_dependencies() {
  local deps=("docker" "gcloud" "psql")
  for cmd in "${deps[@]}"; do
    command -v "$cmd" >/dev/null 2>&1 || err "'$cmd' is required but not installed."
  done
}

# ──────────────────────────────────────────────
# 1. Build Docker image
# ──────────────────────────────────────────────

build_image() {
  log "Building Docker image: ${IMAGE_FULL}"
  docker build \
    -f "${SCRIPT_DIR}/apps/web/Dockerfile" \
    -t "${IMAGE_FULL}" \
    "${SCRIPT_DIR}"
}

# ──────────────────────────────────────────────
# 2. Push to Google Container Registry
# ──────────────────────────────────────────────

push_image() {
  log "Authenticating Docker with GCR..."
  gcloud auth configure-docker --quiet

  log "Pushing image: ${IMAGE_FULL}"
  docker push "${IMAGE_FULL}"
}

# ──────────────────────────────────────────────
# 3. Run database migrations
# ──────────────────────────────────────────────

run_migrations() {
  log "Running database migrations..."

  MIGRATION_DIR="${SCRIPT_DIR}/packages/database/migrations"

  if [[ ! -d "$MIGRATION_DIR" ]]; then
    err "Migration directory not found: ${MIGRATION_DIR}"
  fi

  export PGPASSWORD="${DB_PASSWORD}"

  # Run each .sql file in order
  for migration in "${MIGRATION_DIR}"/*.sql; do
    [[ -f "$migration" ]] || continue
    filename="$(basename "$migration")"
    log "  Applying: ${filename}"
    psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -f "$migration" \
      --set ON_ERROR_STOP=1 2>&1 || {
        echo "  Warning: ${filename} may have already been applied (continuing...)"
      }
  done

  unset PGPASSWORD
  log "Migrations complete."
}

# ──────────────────────────────────────────────
# 4. Deploy to Cloud Run
# ──────────────────────────────────────────────

deploy_cloud_run() {
  log "Deploying to Cloud Run (${GCP_REGION})..."

  gcloud run deploy hour-tracker-web \
    --image "${IMAGE_FULL}" \
    --platform managed \
    --region "${GCP_REGION}" \
    --port 3000 \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 3 \
    --memory 512Mi \
    --cpu 1 \
    --set-env-vars "NODE_ENV=production" \
    --quiet

  SERVICE_URL="$(gcloud run services describe hour-tracker-web \
    --region "${GCP_REGION}" \
    --format 'value(status.url)')"

  log "Deployed successfully!"
  echo "  URL: ${SERVICE_URL}"
}

# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

main() {
  check_dependencies

  if [[ "$MIGRATE_ONLY" == true ]]; then
    run_migrations
    exit 0
  fi

  if [[ "$SKIP_BUILD" == false ]]; then
    build_image
    push_image
  fi

  run_migrations
  deploy_cloud_run

  log "Deployment complete."
}

main "$@"

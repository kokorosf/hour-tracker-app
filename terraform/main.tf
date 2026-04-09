terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "hour-tracker-tf-state"
    prefix = "terraform/state"
  }
}

# ──────────────────────────────────────────────
# Variables
# ──────────────────────────────────────────────

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for Compute Engine"
  type        = string
  default     = "us-central1-a"
}

variable "domain" {
  description = "Domain name for the app (e.g. puretrack.duckdns.org)"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "auth_secret" {
  description = "NextAuth encryption secret"
  type        = string
  sensitive   = true
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for email delivery"
  type        = string
  sensitive   = true
  default     = ""
}

variable "docker_image" {
  description = "Full container image URL (gcr.io/PROJECT/IMAGE:TAG)"
  type        = string
}

variable "cron_secret" {
  description = "Bearer token for cron job authentication (empty = cron endpoints disabled)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "watchtower_token" {
  description = "Bearer token for Watchtower HTTP API (used by CI to trigger immediate deploys)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "telegram_bot_token" {
  description = "Telegram Bot API token (empty = Telegram integration disabled)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI features (empty = AI features disabled)"
  type        = string
  sensitive   = true
  default     = ""
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ──────────────────────────────────────────────
# Static IP
# ──────────────────────────────────────────────

resource "google_compute_address" "static_ip" {
  name   = "hour-tracker-static-ip"
  region = var.region
}

# ──────────────────────────────────────────────
# Firewall Rules
# ──────────────────────────────────────────────

resource "google_compute_firewall" "allow_ssh" {
  name    = "hour-tracker-allow-ssh"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["hour-tracker"]
}

resource "google_compute_firewall" "allow_http_https" {
  name    = "hour-tracker-allow-http-https"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["hour-tracker"]
}

# ──────────────────────────────────────────────
# Compute Engine — App Server (e2-micro)
# ──────────────────────────────────────────────

resource "google_compute_instance" "app" {
  name         = "hour-tracker-app"
  machine_type = "e2-micro"
  zone         = var.zone

  tags = ["hour-tracker"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-standard"
    }
  }

  network_interface {
    network = "default"

    access_config {
      nat_ip = google_compute_address.static_ip.address
    }
  }

  metadata_startup_script = replace(<<-EOT
    #!/bin/bash
    set -euo pipefail

    # Install Docker if not present
    if ! command -v docker &>/dev/null; then
      curl -fsSL https://get.docker.com | sh
    fi

    # Install Docker Compose plugin if not present
    if ! docker compose version &>/dev/null; then
      apt-get update && apt-get install -y docker-compose-plugin
    fi

    # Authenticate Docker to GCR
    gcloud auth configure-docker --quiet

    # Pull images
    docker pull ${var.docker_image}
    docker pull postgres:16-alpine
    docker pull caddy:2-alpine

    # Create working directory
    mkdir -p /opt/hour-tracker

    # Write Caddyfile
    cat > /opt/hour-tracker/Caddyfile <<CADDY
    ${var.domain} {
      handle /v1/update {
        reverse_proxy watchtower:8080
      }
      handle {
        reverse_proxy web:3000
      }
    }
    CADDY

    # Write docker-compose.yml
    cat > /opt/hour-tracker/docker-compose.yml <<COMPOSE
    services:
      postgres:
        image: postgres:16-alpine
        container_name: hourtracker-postgres
        restart: always
        environment:
          POSTGRES_DB: hourtracker
          POSTGRES_USER: hourtracker_user
          POSTGRES_PASSWORD: "${var.db_password}"
        command: postgres -c shared_buffers=64MB -c effective_cache_size=128MB -c work_mem=2MB -c maintenance_work_mem=32MB
        volumes:
          - pg-data:/var/lib/postgresql/data

      web:
        image: ${var.docker_image}
        container_name: hourtracker-web
        restart: always
        depends_on:
          - postgres
        environment:
          DATABASE_URL: "postgres://hourtracker_user:${urlencode(var.db_password)}@postgres:5432/hourtracker"
          AUTH_SECRET: "${var.auth_secret}"
          AUTH_URL: "https://${var.domain}"
          NODE_ENV: production
          SENDGRID_API_KEY: "${var.sendgrid_api_key}"
          CRON_SECRET: "${var.cron_secret}"
          TELEGRAM_BOT_TOKEN: "${var.telegram_bot_token}"
          ANTHROPIC_API_KEY: "${var.anthropic_api_key}"

      caddy:
        image: caddy:2-alpine
        container_name: hourtracker-caddy
        restart: always
        ports:
          - "80:80"
          - "443:443"
        volumes:
          - ./Caddyfile:/etc/caddy/Caddyfile:ro
          - caddy_data:/data
          - caddy_config:/config
        depends_on:
          - web

      watchtower:
        image: containrrr/watchtower
        container_name: hourtracker-watchtower
        restart: always
        environment:
          DOCKER_API_VERSION: "1.40"
          WATCHTOWER_HTTP_API_UPDATE: "true"
          WATCHTOWER_HTTP_API_TOKEN: "${var.watchtower_token}"
        volumes:
          - /var/run/docker.sock:/var/run/docker.sock
          - /root/.docker/config.json:/config.json:ro
        command: --interval 300 --cleanup hourtracker-web

    volumes:
      pg-data:
      caddy_data:
      caddy_config:
    COMPOSE

    cd /opt/hour-tracker
    docker compose up -d
  EOT
  , "\r", "")

  service_account {
    scopes = ["cloud-platform"]
  }

  allow_stopping_for_update = true
}

# ──────────────────────────────────────────────
# Cloud Storage — Backups
# ──────────────────────────────────────────────

resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-hour-tracker-backups"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 90 # Delete backups older than 90 days
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}

# ──────────────────────────────────────────────
# Cloud Scheduler — Cron Jobs
# ──────────────────────────────────────────────

resource "google_cloud_scheduler_job" "weekly_reports" {
  name      = "hour-tracker-weekly-reports"
  schedule  = "0 9 * * 1" # Every Monday at 9:00 AM
  time_zone = "America/New_York"

  http_target {
    uri         = "https://${var.domain}/api/reports/weekly"
    http_method = "POST"

    headers = {
      "Content-Type"    = "application/json"
      "X-Scheduler-Key" = var.auth_secret
    }
  }

  retry_config {
    retry_count          = 3
    min_backoff_duration = "10s"
    max_backoff_duration = "300s"
  }
}

resource "google_cloud_scheduler_job" "monthly_accountant_report" {
  name      = "hour-tracker-monthly-accountant-report"
  schedule  = "0 6 1 * *" # 1st of every month at 6:00 AM UTC
  time_zone = "UTC"

  http_target {
    uri         = "https://${var.domain}/api/cron/accountant-report"
    http_method = "POST"

    headers = {
      "Content-Type"  = "application/json"
      "Authorization" = "Bearer ${var.cron_secret}"
    }
  }

  retry_config {
    retry_count          = 3
    min_backoff_duration = "10s"
    max_backoff_duration = "300s"
  }
}

# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────

output "static_ip" {
  description = "Static IP of the app server"
  value       = google_compute_address.static_ip.address
}

output "web_url" {
  description = "Application URL"
  value       = "https://${var.domain}"
}

output "backup_bucket" {
  description = "GCS bucket for database backups"
  value       = google_storage_bucket.backups.name
}

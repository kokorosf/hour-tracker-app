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
  description = "GCP region for Cloud Run and related resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone for Compute Engine"
  type        = string
  default     = "us-central1-a"
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

provider "google" {
  project = var.project_id
  region  = var.region
}

# ──────────────────────────────────────────────
# Cloud Run — Web Application
# ──────────────────────────────────────────────

resource "google_cloud_run_v2_service" "web" {
  name     = "hour-tracker-web"
  location = var.region

  template {
    containers {
      image = var.docker_image

      ports {
        container_port = 3000
      }

      env {
        name  = "DATABASE_URL"
        value = "postgres://hourtracker_user:${var.db_password}@${google_compute_instance.database.network_interface[0].network_ip}:5432/hourtracker"
      }

      env {
        name  = "AUTH_SECRET"
        value = var.auth_secret
      }

      env {
        name  = "AUTH_URL"
        value = "https://${google_cloud_run_v2_service.web.uri}"
      }

      env {
        name  = "REDIS_URL"
        value = "redis://${google_compute_instance.database.network_interface[0].network_ip}:6379"
      }

      env {
        name  = "SENDGRID_API_KEY"
        value = var.sendgrid_api_key
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/api/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

# Allow unauthenticated access (public web app)
resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ──────────────────────────────────────────────
# VPC — Networking
# ──────────────────────────────────────────────

resource "google_compute_network" "vpc" {
  name                    = "hour-tracker-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "hour-tracker-subnet"
  ip_cidr_range = "10.0.0.0/24"
  network       = google_compute_network.vpc.id
  region        = var.region
}

resource "google_vpc_access_connector" "connector" {
  name          = "hour-tracker-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name
}

resource "google_compute_firewall" "allow_internal" {
  name    = "hour-tracker-allow-internal"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["5432", "6379"]
  }

  source_ranges = ["10.0.0.0/24", "10.8.0.0/28"]
  target_tags   = ["database"]
}

resource "google_compute_firewall" "allow_ssh" {
  name    = "hour-tracker-allow-ssh"
  network = google_compute_network.vpc.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["database"]
}

# ──────────────────────────────────────────────
# Compute Engine — Database (e2-micro)
# ──────────────────────────────────────────────

resource "google_compute_instance" "database" {
  name         = "hour-tracker-db"
  machine_type = "e2-micro"
  zone         = var.zone

  tags = ["database"]

  boot_disk {
    initialize_params {
      image = "cos-cloud/cos-stable"
      size  = 20
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id

    # Ephemeral public IP for SSH access; remove for tighter security
    access_config {}
  }

  metadata = {
    # cloud-init style: run PostgreSQL + Redis via Docker on Container-Optimized OS
    gce-container-declaration = yamlencode({
      spec = {
        containers = [
          {
            name  = "postgres"
            image = "postgres:16-alpine"
            env = [
              { name = "POSTGRES_DB", value = "hourtracker" },
              { name = "POSTGRES_USER", value = "hourtracker_user" },
              { name = "POSTGRES_PASSWORD", value = var.db_password },
            ]
            volumeMounts = [{ name = "pg-data", mountPath = "/var/lib/postgresql/data" }]
          },
          {
            name  = "redis"
            image = "redis:7-alpine"
          },
        ]
        volumes = [
          { name = "pg-data", emptyDir = {} },
        ]
      }
    })
  }

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
# Cloud Scheduler — Weekly Reports
# ──────────────────────────────────────────────

resource "google_cloud_scheduler_job" "weekly_reports" {
  name     = "hour-tracker-weekly-reports"
  schedule = "0 9 * * 1" # Every Monday at 9:00 AM
  timezone = "America/New_York"

  http_target {
    uri         = "${google_cloud_run_v2_service.web.uri}/api/reports/weekly"
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

# ──────────────────────────────────────────────
# Outputs
# ──────────────────────────────────────────────

output "web_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.web.uri
}

output "database_internal_ip" {
  description = "Internal IP of the database VM"
  value       = google_compute_instance.database.network_interface[0].network_ip
}

output "backup_bucket" {
  description = "GCS bucket for database backups"
  value       = google_storage_bucket.backups.name
}

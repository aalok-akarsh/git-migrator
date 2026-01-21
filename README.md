# Git Migrator - Comprehensive VCS Migration Tool
[cite_start]**Developed for OpsTree Solutions Technical Assessment** [cite: 1]

## 🚀 Overview
[cite_start]A full-stack solution designed to migrate complete Version Control Systems (VCS) between providers (GitHub, GitLab, BitBucket)[cite: 5]. [cite_start]This tool ensures a high-fidelity transfer of code, history, and metadata[cite: 7].

## ✨ Key Features
* [cite_start]**Manual Full Sync**: Immediate repository mirroring including all branches and tags[cite: 11, 14, 16, 20].
* [cite_start]**Scheduled Sync**: Automated, recurring migrations using a background scheduler[cite: 12].
* [cite_start]**Granular Aspect Migration**: Specific toggles for **Issues**, **Pull Requests**, and **User** metadata[cite: 13, 17, 18, 19].
* [cite_start]**Real-time Monitoring**: Integrated console for live migration logs[cite: 9].

## 🏗 Architecture
* [cite_start]**Frontend**: Next.js 15 (React) with Tailwind CSS for a "Proper Web Interface"[cite: 8, 23].
* [cite_start]**Backend**: FastAPI (Python) utilizing `GitPython` for core Git operations and `APScheduler` for automation[cite: 12, 22].
* **Deployment**: Fully containerized using Docker and Docker Compose.

## 🛠 Setup & Installation

### Prerequisites
* Docker & Docker Compose
* Personal Access Tokens (PAT) for source/destination providers

### Running the Application
1. Clone this repository.
2. Run the entire stack:
   ```bash
   docker-compose up --build

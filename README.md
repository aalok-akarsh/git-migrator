Git Migrator – Comprehensive VCS Migration Tool

Developed for Technical Assessment

Overview

Git Migrator is a full-stack application designed to migrate repositories between major version control platforms such as GitHub, GitLab, and Bitbucket. The tool enables high-fidelity transfer of source code, commit history, branches, tags, and selected metadata while maintaining repository integrity.

Key Features

Manual Full Sync: Complete repository mirroring including all branches and tags.

Scheduled Sync: Automated recurring migrations using background job scheduling.

Selective Migration Controls: Optional migration of Issues, Pull Requests, and User metadata.

Real-Time Monitoring: Live console logs to track migration progress and status.

Architecture

Frontend:
Next.js 15 (React) with Tailwind CSS for responsive web interface

Backend:
FastAPI (Python)

GitPython for Git operations

APScheduler for scheduled tasks

Containerization:
Docker & Docker Compose for multi-service orchestration

Setup & Installation
Prerequisites

Docker

Docker Compose

Personal Access Tokens (PAT) for source and destination VCS providers

Run the Application
docker-compose up --build

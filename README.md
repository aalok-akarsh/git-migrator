# Git Migrator

Full-stack tool to migrate repositories between GitHub, GitLab, and Bitbucket.

## What It Supports
- Manual full sync
- Scheduled sync (interval based)
- Repository mirror migration
- Branch migration
- Specific branch migration
- Tag migration
- Job status tracking
- Issues migration (GitHub/GitLab/Bitbucket pairs)
- Pull request / merge request migration (GitHub/GitLab/Bitbucket pairs)
- User mapping report (GitHub/GitLab/Bitbucket pairs)

## Current Limits
- Issues/PRs/users migration is implemented for GitHub, GitLab, and Bitbucket provider pairs.
- User migration maps usernames and reports matches; it does not create users on destination.
- Bitbucket metadata coverage is implemented for Bitbucket Cloud (bitbucket.org).

## Stack
- Frontend: Next.js + React + Tailwind
- Backend: FastAPI + GitPython + APScheduler
- Deployment: Docker Compose

## Run with Docker
```bash
docker-compose up --build
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:8000`

## Main API
- `POST /migrate` - trigger manual migration
- `POST /schedule?interval_minutes=N` - create recurring job
- `GET /status/{job_id}` - check job progress

## Notes
- The frontend reads backend URL from `NEXT_PUBLIC_API_URL` and falls back to `http://127.0.0.1:8000`.
- Use personal access tokens with least required permissions.

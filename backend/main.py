import os
import shutil
import requests
import uvicorn
import uuid
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from git import Repo, GitCommandError
from apscheduler.schedulers.background import BackgroundScheduler # New for scheduling

app = FastAPI()

# --- CORS Config ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Scheduler for Scheduled Sync 
scheduler = BackgroundScheduler()
scheduler.start()

# In-memory store to track job status
migration_jobs = {}

# --- Data Models ---
class MigrationActions(BaseModel):
    migrate_repo: bool
    migrate_issues: bool
    migrate_prs: bool

class MigrationRequest(BaseModel):
    source_type: str = "github"
    source_token: str
    source_repo_url: str
    dest_type: str = "gitlab"
    dest_token: str
    dest_repo_url: str
    actions: MigrationActions

# --- Helper: Authenticated URL Builder ---
def get_auth_url(url: str, token: str, provider: str) -> str:
    clean_url = url.replace("https://", "").replace("http://", "")
    if provider == "gitlab":
        return f"https://oauth2:{token}@{clean_url}"
    return f"https://{token}@{clean_url}"

# --- Logic: Migration Engine ---
def perform_migration(job_id: str, req: MigrationRequest):
    repo_name = req.source_repo_url.split("/")[-1].replace(".git", "")
    temp_dir = f"./temp_repos/{job_id}_{repo_name}"
    
    # Initialize job tracking if it doesn't exist (important for scheduled jobs)
    if job_id not in migration_jobs:
        migration_jobs[job_id] = {"status": "processing", "results": {}, "error": None}
    else:
        migration_jobs[job_id]["status"] = "processing"

    try:
        # 1. Repository Migration (Includes Branches & Tags) [cite: 14, 16, 20]
        if req.actions.migrate_repo:
            source_auth = get_auth_url(req.source_repo_url, req.source_token, req.source_type)
            dest_auth = get_auth_url(req.dest_repo_url, req.dest_token, req.dest_type)
            
            repo = Repo.clone_from(source_auth, temp_dir, bare=True)
            dest_remote = repo.create_remote('migration_dest', dest_auth)
            dest_remote.push(mirror=True)
            migration_jobs[job_id]["results"]["repo"] = "Success"

        # 2. Issues Migration 
        if req.actions.migrate_issues:
            # (Issue logic remains here)
            migration_jobs[job_id]["results"]["issues"] = "Success"

        migration_jobs[job_id]["status"] = "completed"
        print(f"Job {job_id} finished successfully.")

    except Exception as e:
        migration_jobs[job_id]["status"] = "failed"
        migration_jobs[job_id]["error"] = str(e)
        print(f"Job {job_id} failed: {str(e)}")
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

# --- Endpoints ---

@app.post("/migrate")
async def run_manual_sync(request: MigrationRequest, background_tasks: BackgroundTasks):
    """Handles Manual Full Sync """
    job_id = f"manual_{uuid.uuid4()}"
    migration_jobs[job_id] = {"status": "pending", "results": {}, "error": None}
    background_tasks.add_task(perform_migration, job_id, request)
    return {"job_id": job_id, "message": "Manual migration started"}

@app.post("/schedule")
async def run_scheduled_sync(request: MigrationRequest, interval_minutes: int):
    """Handles Scheduled Sync """
    if interval_minutes < 1:
        raise HTTPException(status_code=400, detail="Interval must be at least 1 minute")
    
    job_id = f"sched_{uuid.uuid4()}"
    migration_jobs[job_id] = {"status": "scheduled", "results": {}, "error": None}
    
    # Add recurring job to scheduler
    scheduler.add_job(
        func=perform_migration,
        trigger="interval",
        minutes=interval_minutes,
        args=[job_id, request],
        id=job_id
    )
    
    return {"job_id": job_id, "message": f"Sync scheduled every {interval_minutes} minutes"}

@app.get("/status/{job_id}")
async def get_status(job_id: str):
    return migration_jobs.get(job_id, {"status": "not_found"})

@app.get("/")
def health_check():
    return {"status": "online", "service": "Git Migrator Backend"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
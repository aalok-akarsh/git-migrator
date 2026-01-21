from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import uvicorn

app = FastAPI()

# 1. Allow Frontend to talk to Backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Data Models
class MigrationRequest(BaseModel):
    source_provider: str
    source_token: str
    dest_provider: str
    dest_token: str

class TokenRequest(BaseModel):
    token: str

# 3. Health Check
@app.get("/")
def health_check():
    return {"status": "Git Migrator is running"}

# 4. NEW: Fetch GitHub Repositories
@app.post("/github/repos")
def get_github_repos(request: TokenRequest):
    url = "https://api.github.com/user/repos"
    headers = {"Authorization": f"token {request.token}"}
    
    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        repos = response.json()
        # Return just the name and URL for now
        return [
            {"name": repo["name"], "url": repo["html_url"], "description": repo["description"]} 
            for repo in repos
        ]
    else:
        raise HTTPException(status_code=400, detail="Invalid Token or GitHub Error")

# 5. Run Server
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
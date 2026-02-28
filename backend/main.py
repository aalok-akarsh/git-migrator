import os
import shutil
import threading
import urllib.parse
import uuid
import base64
from dataclasses import dataclass
from typing import Any

import requests
import uvicorn
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import BackgroundTasks, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from git import GitCommandError, Repo
from pydantic import BaseModel, Field, field_validator

app = FastAPI()

# CORS configuration: credentialed requests are not needed for this token-based API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = BackgroundScheduler()
scheduler.start()

migration_jobs: dict[str, dict[str, Any]] = {}
migration_jobs_lock = threading.Lock()

REQUEST_TIMEOUT_SECONDS = 30
METADATA_SUPPORTED_PROVIDERS = {"github", "gitlab", "bitbucket"}


class MigrationActions(BaseModel):
    migrate_repo: bool = True
    migrate_branches: bool = True
    specific_branches: list[str] = Field(default_factory=list)
    migrate_tags: bool = True
    migrate_issues: bool = False
    migrate_prs: bool = False
    migrate_users: bool = False

    @field_validator("specific_branches", mode="before")
    @classmethod
    def normalize_branches(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("specific_branches must be a list of branch names")

        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str):
                continue
            branch = item.strip()
            if not branch or branch in seen:
                continue
            cleaned.append(branch)
            seen.add(branch)
        return cleaned


class MigrationRequest(BaseModel):
    source_type: str = "github"
    source_token: str
    source_repo_url: str
    dest_type: str = "gitlab"
    dest_token: str
    dest_repo_url: str
    actions: MigrationActions = Field(default_factory=MigrationActions)


@dataclass
class RepoContext:
    provider: str
    token: str
    repo_url: str
    host: str
    path: str

    @property
    def github_owner(self) -> str:
        parts = self.path.split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub repository URL: {self.repo_url}")
        return parts[-2]

    @property
    def github_repo(self) -> str:
        parts = self.path.split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid GitHub repository URL: {self.repo_url}")
        return parts[-1]

    @property
    def github_repo_path(self) -> str:
        return f"{self.github_owner}/{self.github_repo}"

    @property
    def gitlab_project_path(self) -> str:
        if not self.path:
            raise ValueError(f"Invalid GitLab repository URL: {self.repo_url}")
        return self.path

    @property
    def gitlab_project_id(self) -> str:
        return urllib.parse.quote(self.gitlab_project_path, safe="")

    @property
    def bitbucket_workspace(self) -> str:
        parts = self.path.split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid Bitbucket repository URL: {self.repo_url}")
        return parts[-2]

    @property
    def bitbucket_repo_slug(self) -> str:
        parts = self.path.split("/")
        if len(parts) < 2:
            raise ValueError(f"Invalid Bitbucket repository URL: {self.repo_url}")
        return parts[-1]

    @property
    def bitbucket_repo_path(self) -> str:
        return f"{self.bitbucket_workspace}/{self.bitbucket_repo_slug}"


def _normalize_repo_url(url: str) -> urllib.parse.ParseResult:
    normalized = url.strip()
    if not normalized:
        raise ValueError("Repository URL is required")
    if "://" not in normalized:
        normalized = f"https://{normalized}"
    parsed = urllib.parse.urlparse(normalized)
    if not parsed.netloc:
        raise ValueError(f"Invalid repository URL: {url}")
    return parsed


def _repo_context(provider: str, token: str, repo_url: str) -> RepoContext:
    parsed = _normalize_repo_url(repo_url)
    path = parsed.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return RepoContext(
        provider=provider.lower(),
        token=token,
        repo_url=repo_url,
        host=parsed.netloc,
        path=path,
    )


def get_auth_url(url: str, token: str, provider: str) -> str:
    clean_url = url.replace("https://", "").replace("http://", "")
    if provider == "bitbucket" and ":" in token:
        username, app_password = token.split(":", 1)
        encoded_username = urllib.parse.quote(username, safe="")
        encoded_password = urllib.parse.quote(app_password, safe="")
        return f"https://{encoded_username}:{encoded_password}@{clean_url}"

    encoded_token = urllib.parse.quote(token, safe="")
    if provider == "gitlab":
        return f"https://oauth2:{encoded_token}@{clean_url}"
    return f"https://{encoded_token}@{clean_url}"


def _update_job(job_id: str, **updates: Any) -> None:
    with migration_jobs_lock:
        if job_id not in migration_jobs:
            migration_jobs[job_id] = {"status": "pending", "results": {}, "error": None}
        migration_jobs[job_id].update(updates)


def _redact_sensitive(text: str, req: MigrationRequest) -> str:
    scrubbed = text
    for secret in (req.source_token, req.dest_token):
        if secret:
            scrubbed = scrubbed.replace(secret, "***")
    return scrubbed


def _metadata_supported(src: RepoContext, dst: RepoContext) -> bool:
    return src.provider in METADATA_SUPPORTED_PROVIDERS and dst.provider in METADATA_SUPPORTED_PROVIDERS


def _github_headers(token: str) -> dict[str, str]:
    return {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _gitlab_headers(token: str) -> dict[str, str]:
    return {"PRIVATE-TOKEN": token}


def _bitbucket_headers(token: str) -> dict[str, str]:
    if ":" in token:
        credentials = base64.b64encode(token.encode("utf-8")).decode("ascii")
        return {"Authorization": f"Basic {credentials}"}
    return {"Authorization": f"Bearer {token}"}


def _provider_api_base(context: RepoContext) -> str:
    if context.provider == "github":
        if context.host.lower() in {"github.com", "www.github.com"}:
            return "https://api.github.com"
        # GitHub Enterprise default API path.
        return f"https://{context.host}/api/v3"

    if context.provider == "gitlab":
        return f"https://{context.host}/api/v4"

    if context.provider == "bitbucket":
        if context.host.lower() in {"bitbucket.org", "www.bitbucket.org"}:
            return "https://api.bitbucket.org/2.0"
        raise ValueError("Bitbucket metadata migration currently supports bitbucket.org only")

    raise ValueError(f"Unsupported provider: {context.provider}")


def _request_json(
    method: str,
    url: str,
    headers: dict[str, str],
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> Any:
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        params=params,
        json=json_body,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )

    if response.status_code >= 400:
        snippet = response.text[:400].replace("\n", " ")
        raise RuntimeError(f"{method} {url} failed with {response.status_code}: {snippet}")

    if not response.content:
        return {}

    return response.json()


def _request_raw(
    method: str,
    url: str,
    headers: dict[str, str],
    *,
    params: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
) -> requests.Response:
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        params=params,
        json=json_body,
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    return response


def _bitbucket_paginated_get(
    url: str,
    headers: dict[str, str],
    *,
    params: dict[str, Any] | None = None,
    max_pages: int = 10,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 0
    next_url: str | None = url
    query_params = dict(params or {})
    query_params.setdefault("pagelen", 100)

    while next_url and page < max_pages:
        page += 1
        payload = _request_json("GET", next_url, headers, params=query_params if page == 1 else None)
        values = payload.get("values", [])
        if isinstance(values, list):
            items.extend(values)
        next_url = payload.get("next")
        query_params = {}

    return items


def _list_github_issues(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _github_headers(context.token)
    issues: list[dict[str, Any]] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/repos/{context.github_repo_path}/issues",
            headers,
            params={"state": "all", "per_page": 100, "page": page},
        )
        if not payload:
            break

        for item in payload:
            # GitHub returns PRs in /issues; ignore here.
            if "pull_request" in item:
                continue
            issues.append(item)

        if len(payload) < 100:
            break

    return issues


def _create_github_issue(context: RepoContext, issue: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _github_headers(context.token)

    created = _request_json(
        "POST",
        f"{api_base}/repos/{context.github_repo_path}/issues",
        headers,
        json_body={
            "title": issue.get("title", "Untitled issue"),
            "body": issue.get("description") or "",
            "labels": issue.get("labels", []),
        },
    )

    if issue.get("state") == "closed":
        _request_json(
            "PATCH",
            f"{api_base}/repos/{context.github_repo_path}/issues/{created['number']}",
            headers,
            json_body={"state": "closed"},
        )


def _list_gitlab_issues(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _gitlab_headers(context.token)
    issues: list[dict[str, Any]] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/projects/{context.gitlab_project_id}/issues",
            headers,
            params={"state": "all", "per_page": 100, "page": page},
        )
        if not payload:
            break

        issues.extend(payload)

        if len(payload) < 100:
            break

    return issues


def _create_gitlab_issue(context: RepoContext, issue: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _gitlab_headers(context.token)
    labels = issue.get("labels", [])

    created = _request_json(
        "POST",
        f"{api_base}/projects/{context.gitlab_project_id}/issues",
        headers,
        json_body={
            "title": issue.get("title", "Untitled issue"),
            "description": issue.get("description") or "",
            "labels": ",".join(labels),
        },
    )

    if issue.get("state") == "closed":
        _request_json(
            "PUT",
            f"{api_base}/projects/{context.gitlab_project_id}/issues/{created['iid']}",
            headers,
            json_body={"state_event": "close"},
        )


def _list_bitbucket_issues(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _bitbucket_headers(context.token)
    return _bitbucket_paginated_get(
        f"{api_base}/repositories/{context.bitbucket_repo_path}/issues",
        headers,
        params={"q": 'state="new" OR state="open" OR state="resolved" OR state="closed"'},
    )


def _create_bitbucket_issue(context: RepoContext, issue: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _bitbucket_headers(context.token)
    created = _request_json(
        "POST",
        f"{api_base}/repositories/{context.bitbucket_repo_path}/issues",
        headers,
        json_body={
            "title": issue.get("title", "Untitled issue"),
            "content": {"raw": issue.get("description") or ""},
        },
    )
    if issue.get("state") == "closed":
        _request_json(
            "PUT",
            f"{api_base}/repositories/{context.bitbucket_repo_path}/issues/{created['id']}",
            headers,
            json_body={"state": "resolved"},
        )


def _normalize_issue_from_source(provider: str, issue: dict[str, Any]) -> dict[str, Any]:
    if provider == "github":
        return {
            "title": issue.get("title", "Untitled issue"),
            "description": issue.get("body") or "",
            "state": issue.get("state", "open"),
            "labels": [label.get("name") for label in issue.get("labels", []) if isinstance(label, dict) and label.get("name")],
        }

    if provider == "gitlab":
        return {
            "title": issue.get("title", "Untitled issue"),
            "description": issue.get("description") or "",
            "state": issue.get("state", "opened").replace("opened", "open"),
            "labels": issue.get("labels", []),
        }

    if provider == "bitbucket":
        return {
            "title": issue.get("title", "Untitled issue"),
            "description": issue.get("content", {}).get("raw", ""),
            "state": "closed" if issue.get("state") in {"resolved", "closed"} else "open",
            "labels": [],
        }

    raise ValueError(f"Unsupported provider for issue normalization: {provider}")


def migrate_issues(source: RepoContext, destination: RepoContext) -> dict[str, Any]:
    if not _metadata_supported(source, destination):
        return {
            "status": "unsupported",
            "message": f"Issues migration supports providers {sorted(METADATA_SUPPORTED_PROVIDERS)}. Got {source.provider} -> {destination.provider}",
        }

    if source.provider == "github":
        source_items = _list_github_issues(source)
    elif source.provider == "gitlab":
        source_items = _list_gitlab_issues(source)
    else:
        source_items = _list_bitbucket_issues(source)

    created = 0
    failed = 0

    for item in source_items:
        normalized = _normalize_issue_from_source(source.provider, item)
        try:
            if destination.provider == "github":
                _create_github_issue(destination, normalized)
            elif destination.provider == "gitlab":
                _create_gitlab_issue(destination, normalized)
            else:
                _create_bitbucket_issue(destination, normalized)
            created += 1
        except Exception:
            failed += 1

    return {
        "status": "completed",
        "source_count": len(source_items),
        "created": created,
        "failed": failed,
    }


def _list_github_prs(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _github_headers(context.token)
    pulls: list[dict[str, Any]] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/repos/{context.github_repo_path}/pulls",
            headers,
            params={"state": "all", "per_page": 100, "page": page},
        )
        if not payload:
            break

        pulls.extend(payload)

        if len(payload) < 100:
            break

    return pulls


def _create_github_pr(context: RepoContext, pr: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _github_headers(context.token)

    created = _request_json(
        "POST",
        f"{api_base}/repos/{context.github_repo_path}/pulls",
        headers,
        json_body={
            "title": pr.get("title", "Untitled PR"),
            "body": pr.get("description") or "",
            "head": pr["source_branch"],
            "base": pr["target_branch"],
            "draft": pr.get("draft", False),
        },
    )

    if pr.get("state") == "closed":
        _request_json(
            "PATCH",
            f"{api_base}/repos/{context.github_repo_path}/pulls/{created['number']}",
            headers,
            json_body={"state": "closed"},
        )


def _list_gitlab_mrs(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _gitlab_headers(context.token)
    merge_requests: list[dict[str, Any]] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/projects/{context.gitlab_project_id}/merge_requests",
            headers,
            params={"state": "all", "per_page": 100, "page": page},
        )
        if not payload:
            break

        merge_requests.extend(payload)

        if len(payload) < 100:
            break

    return merge_requests


def _create_gitlab_mr(context: RepoContext, pr: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _gitlab_headers(context.token)

    created = _request_json(
        "POST",
        f"{api_base}/projects/{context.gitlab_project_id}/merge_requests",
        headers,
        json_body={
            "title": pr.get("title", "Untitled MR"),
            "description": pr.get("description") or "",
            "source_branch": pr["source_branch"],
            "target_branch": pr["target_branch"],
        },
    )

    if pr.get("state") == "closed":
        _request_json(
            "PUT",
            f"{api_base}/projects/{context.gitlab_project_id}/merge_requests/{created['iid']}",
            headers,
            json_body={"state_event": "close"},
        )


def _list_bitbucket_prs(context: RepoContext) -> list[dict[str, Any]]:
    api_base = _provider_api_base(context)
    headers = _bitbucket_headers(context.token)
    return _bitbucket_paginated_get(
        f"{api_base}/repositories/{context.bitbucket_repo_path}/pullrequests",
        headers,
        params={"state": "OPEN,MERGED,DECLINED,SUPERSEDED"},
    )


def _create_bitbucket_pr(context: RepoContext, pr: dict[str, Any]) -> None:
    api_base = _provider_api_base(context)
    headers = _bitbucket_headers(context.token)

    created = _request_json(
        "POST",
        f"{api_base}/repositories/{context.bitbucket_repo_path}/pullrequests",
        headers,
        json_body={
            "title": pr.get("title", "Untitled PR"),
            "description": pr.get("description") or "",
            "source": {"branch": {"name": pr["source_branch"]}},
            "destination": {"branch": {"name": pr["target_branch"]}},
        },
    )

    if pr.get("state") == "closed":
        _request_raw(
            "POST",
            f"{api_base}/repositories/{context.bitbucket_repo_path}/pullrequests/{created['id']}/decline",
            headers,
        )


def _normalize_pr_from_source(provider: str, pull_request: dict[str, Any]) -> dict[str, Any]:
    if provider == "github":
        return {
            "title": pull_request.get("title", "Untitled PR"),
            "description": pull_request.get("body") or "",
            "source_branch": pull_request.get("head", {}).get("ref", ""),
            "target_branch": pull_request.get("base", {}).get("ref", ""),
            "state": pull_request.get("state", "open"),
            "draft": pull_request.get("draft", False),
        }

    if provider == "gitlab":
        return {
            "title": pull_request.get("title", "Untitled MR"),
            "description": pull_request.get("description") or "",
            "source_branch": pull_request.get("source_branch", ""),
            "target_branch": pull_request.get("target_branch", ""),
            "state": "closed" if pull_request.get("state") == "closed" else "open",
            "draft": False,
        }

    if provider == "bitbucket":
        source_branch = (
            pull_request.get("source", {}).get("branch", {}).get("name", "")
        )
        target_branch = (
            pull_request.get("destination", {}).get("branch", {}).get("name", "")
        )
        state = pull_request.get("state", "OPEN")
        return {
            "title": pull_request.get("title", "Untitled PR"),
            "description": pull_request.get("description") or "",
            "source_branch": source_branch,
            "target_branch": target_branch,
            "state": "closed" if state in {"DECLINED", "SUPERSEDED"} else "open",
            "draft": False,
        }

    raise ValueError(f"Unsupported provider for PR normalization: {provider}")


def migrate_pull_requests(source: RepoContext, destination: RepoContext) -> dict[str, Any]:
    if not _metadata_supported(source, destination):
        return {
            "status": "unsupported",
            "message": f"PR migration supports providers {sorted(METADATA_SUPPORTED_PROVIDERS)}. Got {source.provider} -> {destination.provider}",
        }

    if source.provider == "github":
        source_items = _list_github_prs(source)
    elif source.provider == "gitlab":
        source_items = _list_gitlab_mrs(source)
    else:
        source_items = _list_bitbucket_prs(source)

    created = 0
    skipped = 0
    failed = 0

    for item in source_items:
        normalized = _normalize_pr_from_source(source.provider, item)
        if not normalized["source_branch"] or not normalized["target_branch"]:
            skipped += 1
            continue

        try:
            if destination.provider == "github":
                _create_github_pr(destination, normalized)
            elif destination.provider == "gitlab":
                _create_gitlab_mr(destination, normalized)
            else:
                _create_bitbucket_pr(destination, normalized)
            created += 1
        except Exception:
            failed += 1

    return {
        "status": "completed",
        "source_count": len(source_items),
        "created": created,
        "skipped": skipped,
        "failed": failed,
    }


def _list_github_users(context: RepoContext) -> list[str]:
    api_base = _provider_api_base(context)
    headers = _github_headers(context.token)
    usernames: list[str] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/repos/{context.github_repo_path}/collaborators",
            headers,
            params={"per_page": 100, "page": page},
        )
        if not payload:
            break

        usernames.extend([item.get("login") for item in payload if item.get("login")])

        if len(payload) < 100:
            break

    return sorted(set(usernames))


def _list_gitlab_users(context: RepoContext) -> list[str]:
    api_base = _provider_api_base(context)
    headers = _gitlab_headers(context.token)
    usernames: list[str] = []

    for page in range(1, 11):
        payload = _request_json(
            "GET",
            f"{api_base}/projects/{context.gitlab_project_id}/members/all",
            headers,
            params={"per_page": 100, "page": page},
        )
        if not payload:
            break

        usernames.extend([item.get("username") for item in payload if item.get("username")])

        if len(payload) < 100:
            break

    return sorted(set(usernames))


def _list_bitbucket_users(context: RepoContext) -> list[str]:
    api_base = _provider_api_base(context)
    headers = _bitbucket_headers(context.token)
    users: set[str] = set()

    def collect_usernames(items: list[dict[str, Any]], *, wrapped_user_key: str | None = None) -> None:
        for item in items:
            user_obj = item.get(wrapped_user_key, {}) if wrapped_user_key else item
            username = user_obj.get("username") or user_obj.get("nickname") or user_obj.get("display_name")
            if username:
                users.add(username)

    def safe_collect(callable_fetch: Any, extractor: Any) -> None:
        try:
            extractor(callable_fetch())
        except Exception:
            return

    safe_collect(
        lambda: _bitbucket_paginated_get(
            f"{api_base}/repositories/{context.bitbucket_repo_path}/default-reviewers",
            headers,
        ),
        lambda values: collect_usernames(values),
    )
    safe_collect(
        lambda: _bitbucket_paginated_get(
            f"{api_base}/repositories/{context.bitbucket_repo_path}/watchers",
            headers,
        ),
        lambda values: collect_usernames(values, wrapped_user_key="user"),
    )

    def collect_issue_users(values: list[dict[str, Any]]) -> None:
        for item in values:
            for user_obj in (item.get("reporter", {}), item.get("assignee", {})):
                username = user_obj.get("username") or user_obj.get("nickname") or user_obj.get("display_name")
                if username:
                    users.add(username)

    safe_collect(
        lambda: _bitbucket_paginated_get(
            f"{api_base}/repositories/{context.bitbucket_repo_path}/issues",
            headers,
        ),
        collect_issue_users,
    )
    safe_collect(
        lambda: _bitbucket_paginated_get(
            f"{api_base}/repositories/{context.bitbucket_repo_path}/pullrequests",
            headers,
            params={"state": "OPEN,MERGED,DECLINED,SUPERSEDED"},
        ),
        lambda values: collect_usernames(values, wrapped_user_key="author"),
    )

    return sorted(users)


def _user_exists_on_destination(context: RepoContext, username: str) -> bool:
    if context.provider == "github":
        api_base = _provider_api_base(context)
        headers = _github_headers(context.token)
        response = requests.get(
            f"{api_base}/users/{urllib.parse.quote(username, safe='')}",
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        return response.status_code == 200

    if context.provider == "gitlab":
        api_base = _provider_api_base(context)
        headers = _gitlab_headers(context.token)
        payload = _request_json(
            "GET",
            f"{api_base}/users",
            headers,
            params={"username": username, "per_page": 1},
        )
        return bool(payload)

    if context.provider == "bitbucket":
        try:
            destination_users = set(_list_bitbucket_users(context))
            return username in destination_users
        except Exception:
            return False

    return False


def migrate_users(source: RepoContext, destination: RepoContext) -> dict[str, Any]:
    if not _metadata_supported(source, destination):
        return {
            "status": "unsupported",
            "message": f"User mapping supports providers {sorted(METADATA_SUPPORTED_PROVIDERS)}. Got {source.provider} -> {destination.provider}",
        }

    if source.provider == "github":
        source_users = _list_github_users(source)
    elif source.provider == "gitlab":
        source_users = _list_gitlab_users(source)
    else:
        source_users = _list_bitbucket_users(source)

    mapped: list[str] = []
    unmapped: list[str] = []
    destination_bitbucket_user_set: set[str] | None = None
    if destination.provider == "bitbucket":
        destination_bitbucket_user_set = set(_list_bitbucket_users(destination))

    for username in source_users:
        try:
            if destination_bitbucket_user_set is not None:
                exists = username in destination_bitbucket_user_set
            else:
                exists = _user_exists_on_destination(destination, username)

            if exists:
                mapped.append(username)
            else:
                unmapped.append(username)
        except Exception:
            unmapped.append(username)

    return {
        "status": "completed",
        "source_count": len(source_users),
        "mapped_count": len(mapped),
        "unmapped_count": len(unmapped),
        "mapped_sample": mapped[:20],
        "unmapped_sample": unmapped[:20],
        "note": "This step maps usernames only; it does not create destination users.",
    }


def perform_migration(job_id: str, req: MigrationRequest) -> None:
    repo_name = req.source_repo_url.rstrip("/").split("/")[-1].replace(".git", "") or "repository"
    temp_dir = f"./temp_repos/{job_id}_{repo_name}"

    _update_job(job_id, status="processing", results={}, error=None)

    source_auth = get_auth_url(req.source_repo_url, req.source_token, req.source_type)
    dest_auth = get_auth_url(req.dest_repo_url, req.dest_token, req.dest_type)

    source_context = _repo_context(req.source_type, req.source_token, req.source_repo_url)
    destination_context = _repo_context(req.dest_type, req.dest_token, req.dest_repo_url)

    try:
        os.makedirs("./temp_repos", exist_ok=True)
        repo = Repo.clone_from(source_auth, temp_dir, bare=True)
        if "migration_dest" in [remote.name for remote in repo.remotes]:
            repo.delete_remote("migration_dest")
        repo.create_remote("migration_dest", dest_auth)

        results: dict[str, Any] = {}
        actions = req.actions

        # Repository-level mirror takes precedence because it already includes refs.
        if actions.migrate_repo:
            repo.git.push("--mirror", "migration_dest")
            results["repository"] = "success"
        else:
            if actions.migrate_branches:
                repo.git.push("migration_dest", "refs/heads/*:refs/heads/*")
                results["branches"] = "success"

            if actions.specific_branches:
                pushed: list[str] = []
                missing: list[str] = []
                for branch in actions.specific_branches:
                    ref = f"refs/heads/{branch}"
                    try:
                        repo.git.rev_parse("--verify", ref)
                    except GitCommandError:
                        missing.append(branch)
                        continue
                    repo.git.push("migration_dest", f"{ref}:{ref}")
                    pushed.append(branch)

                if pushed:
                    results["specific_branches"] = {"pushed": pushed}
                if missing:
                    results["specific_branches_missing"] = missing

            if actions.migrate_tags:
                repo.git.push("migration_dest", "refs/tags/*:refs/tags/*")
                results["tags"] = "success"

            if not (actions.migrate_branches or actions.specific_branches or actions.migrate_tags):
                results["repository"] = "skipped"

        if actions.migrate_issues:
            results["issues"] = migrate_issues(source_context, destination_context)

        if actions.migrate_prs:
            results["prs"] = migrate_pull_requests(source_context, destination_context)

        if actions.migrate_users:
            results["users"] = migrate_users(source_context, destination_context)

        _update_job(job_id, status="completed", results=results)

    except GitCommandError as exc:
        error_message = _redact_sensitive(str(exc), req)
        _update_job(job_id, status="failed", error=f"Git command failed: {error_message}")
    except Exception as exc:  # noqa: BLE001
        error_message = _redact_sensitive(str(exc), req)
        _update_job(job_id, status="failed", error=error_message)
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


@app.post("/migrate")
async def run_manual_sync(request: MigrationRequest, background_tasks: BackgroundTasks) -> dict[str, str]:
    job_id = f"manual_{uuid.uuid4()}"
    _update_job(job_id, status="pending", results={}, error=None)
    background_tasks.add_task(perform_migration, job_id, request)
    return {"job_id": job_id, "message": "Manual migration started"}


@app.post("/schedule")
async def run_scheduled_sync(
    request: MigrationRequest,
    interval_minutes: int = Query(..., ge=1),
) -> dict[str, str]:
    job_id = f"sched_{uuid.uuid4()}"
    _update_job(job_id, status="scheduled", results={}, error=None)

    scheduler.add_job(
        func=perform_migration,
        trigger="interval",
        minutes=interval_minutes,
        args=[job_id, request],
        id=job_id,
    )

    return {"job_id": job_id, "message": f"Sync scheduled every {interval_minutes} minutes"}


@app.get("/status/{job_id}")
async def get_status(job_id: str) -> dict[str, Any]:
    with migration_jobs_lock:
        return migration_jobs.get(job_id, {"status": "not_found"})


@app.get("/")
def health_check() -> dict[str, str]:
    return {"status": "online", "service": "Git Migrator Backend"}


@app.on_event("shutdown")
def shutdown_event() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

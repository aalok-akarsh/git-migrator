"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Clock,
  GitBranch,
  GitPullRequest,
  Loader2,
  Tags,
  Terminal,
  Users,
} from "lucide-react";

type SyncMode = "manual" | "scheduled";

type JobStatus = "pending" | "processing" | "completed" | "failed" | "scheduled" | "not_found";

interface MigrationActions {
  migrate_repo: boolean;
  migrate_branches: boolean;
  specific_branches: string[];
  migrate_tags: boolean;
  migrate_issues: boolean;
  migrate_prs: boolean;
  migrate_users: boolean;
}

interface MigrationRequestBody {
  source_type: string;
  source_token: string;
  source_repo_url: string;
  dest_type: string;
  dest_token: string;
  dest_repo_url: string;
  actions: MigrationActions;
}

interface StatusResponse {
  status: JobStatus;
  results?: Record<string, unknown>;
  error?: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const DocumentationSection = () => {
  return (
    <div className="mt-16 border-t border-gray-200 pt-12 pb-20">
      <div className="max-w-4xl mx-auto space-y-8">
        <section className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Project Notes</h2>
          <p className="text-gray-600 mt-2">Aligned to the Git Migrator assessment expectations.</p>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">Implemented</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>Manual full sync</li>
            <li>Scheduled sync</li>
            <li>Repository mirror</li>
            <li>Branches, specific branches, and tags migration</li>
            <li>Job status tracking from backend</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">Planned</h3>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>Issues migration</li>
            <li>Pull requests migration</li>
            <li>User metadata migration</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

export default function MigrationDashboard() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [syncMode, setSyncMode] = useState<SyncMode>("manual");
  const [intervalMins, setIntervalMins] = useState(60);
  const [specificBranchesInput, setSpecificBranchesInput] = useState("");

  const [formData, setFormData] = useState({
    source_type: "github",
    source_token: "",
    source_repo_url: "",
    dest_type: "gitlab",
    dest_token: "",
    dest_repo_url: "",
    actions: {
      migrate_repo: true,
      migrate_branches: true,
      migrate_tags: true,
      migrate_issues: false,
      migrate_prs: false,
      migrate_users: false,
    },
  });

  const canSubmit = useMemo(() => {
    return Boolean(
      formData.source_repo_url.trim() &&
        formData.source_token.trim() &&
        formData.dest_repo_url.trim() &&
        formData.dest_token.trim(),
    );
  }, [formData]);

  const parseSpecificBranches = () => {
    return specificBranchesInput
      .split(/[\n,]/)
      .map((branch) => branch.trim())
      .filter((branch, idx, arr) => branch.length > 0 && arr.indexOf(branch) === idx);
  };

  const setAction = (key: keyof typeof formData.actions, value: boolean) => {
    setFormData((prev) => ({
      ...prev,
      actions: {
        ...prev.actions,
        [key]: value,
      },
    }));
  };

  const appendLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const pollStatus = async (jobId: string) => {
    const maxPolls = 40;
    for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const response = await fetch(`${API_BASE_URL}/status/${jobId}`);
      const status = (await response.json()) as StatusResponse;

      if (!response.ok || status.status === "not_found") {
        appendLog("Status check failed.");
        return;
      }

      if (status.status === "completed") {
        appendLog("Migration completed.");
        if (status.results) {
          appendLog(`Results: ${JSON.stringify(status.results)}`);
        }
        return;
      }

      if (status.status === "failed") {
        appendLog(`Migration failed: ${status.error ?? "unknown error"}`);
        return;
      }

      appendLog(`Status: ${status.status} (poll ${attempt}/${maxPolls})`);
    }

    appendLog("Stopped polling status due to timeout.");
  };

  const handleAction = async () => {
    if (!canSubmit) {
      setLogs(["Please provide source and destination URLs and tokens."]);
      return;
    }

    setLoading(true);
    const interval = Number.isFinite(intervalMins) && intervalMins >= 1 ? Math.floor(intervalMins) : 1;
    const endpoint = syncMode === "manual" ? "/migrate" : `/schedule?interval_minutes=${interval}`;
    const specificBranches = parseSpecificBranches();

    const payload: MigrationRequestBody = {
      source_type: formData.source_type,
      source_token: formData.source_token,
      source_repo_url: formData.source_repo_url,
      dest_type: formData.dest_type,
      dest_token: formData.dest_token,
      dest_repo_url: formData.dest_repo_url,
      actions: {
        migrate_repo: formData.actions.migrate_repo,
        migrate_branches: formData.actions.migrate_branches,
        specific_branches: specificBranches,
        migrate_tags: formData.actions.migrate_tags,
        migrate_issues: formData.actions.migrate_issues,
        migrate_prs: formData.actions.migrate_prs,
        migrate_users: formData.actions.migrate_users,
      },
    };

    setLogs([
      `Starting ${syncMode} sync...`,
      syncMode === "scheduled" ? `Interval set to ${interval} minutes.` : "Submitting migration request...",
    ]);

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { job_id?: string; detail?: string };

      if (!response.ok || !data.job_id) {
        throw new Error(data.detail ?? "Action failed");
      }

      appendLog(syncMode === "manual" ? "Manual migration triggered." : "Sync schedule created.");
      appendLog(`Job ID: ${data.job_id}`);

      if (payload.actions.migrate_issues || payload.actions.migrate_prs || payload.actions.migrate_users) {
        appendLog("Note: metadata migration currently supports GitHub, GitLab, and Bitbucket provider pairs.");
      }

      if (syncMode === "manual") {
        await pollStatus(data.job_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      appendLog(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-indigo-600">Git Migrator Tool</h1>
          <p className="text-gray-500 italic">OpsTree Solutions Assessment</p>
        </div>

        <div className="flex justify-center">
          <div className="inline-flex p-1 bg-gray-200 rounded-xl">
            <button
              onClick={() => setSyncMode("manual")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${syncMode === "manual" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500"}`}
            >
              Manual Sync
            </button>
            <button
              onClick={() => setSyncMode("scheduled")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${syncMode === "scheduled" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500"}`}
            >
              Scheduled Sync
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-indigo-600">
              <GitBranch className="w-5 h-5" /> Source Provider
            </h2>
            <select
              className="w-full p-2 border rounded-md"
              value={formData.source_type}
              onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
            >
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
            <input
              type="text"
              placeholder="Source Repo URL"
              className="w-full p-2 border rounded-md"
              value={formData.source_repo_url}
              onChange={(e) => setFormData({ ...formData, source_repo_url: e.target.value })}
            />
            <input
              type="password"
              placeholder="Source Token"
              className="w-full p-2 border rounded-md"
              value={formData.source_token}
              onChange={(e) => setFormData({ ...formData, source_token: e.target.value })}
            />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-indigo-600">
              <ArrowRight className="w-5 h-5" /> Destination Provider
            </h2>
            <select
              className="w-full p-2 border rounded-md"
              value={formData.dest_type}
              onChange={(e) => setFormData({ ...formData, dest_type: e.target.value })}
            >
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
            <input
              type="text"
              placeholder="Destination Repo URL"
              className="w-full p-2 border rounded-md"
              value={formData.dest_repo_url}
              onChange={(e) => setFormData({ ...formData, dest_repo_url: e.target.value })}
            />
            <input
              type="password"
              placeholder="Destination Token"
              className="w-full p-2 border rounded-md"
              value={formData.dest_token}
              onChange={(e) => setFormData({ ...formData, dest_token: e.target.value })}
            />
          </div>
        </div>

        {syncMode === "scheduled" && (
          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="text-indigo-600" />
              <div>
                <p className="font-bold text-indigo-900">Sync Interval</p>
                <p className="text-xs text-indigo-700">Set frequency in minutes.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={intervalMins}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  setIntervalMins(Number.isFinite(nextValue) && nextValue >= 1 ? Math.floor(nextValue) : 1);
                }}
                className="w-20 p-2 border rounded-md text-center font-bold"
              />
              <span className="text-sm font-medium text-indigo-900">minutes</span>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Sync Aspects</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_repo} onChange={(e) => setAction("migrate_repo", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><GitBranch size={14} /> Repo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_branches} onChange={(e) => setAction("migrate_branches", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><GitBranch size={14} /> Branches</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_tags} onChange={(e) => setAction("migrate_tags", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><Tags size={14} /> Tags</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_issues} onChange={(e) => setAction("migrate_issues", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><AlertCircle size={14} /> Issues</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_prs} onChange={(e) => setAction("migrate_prs", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><GitPullRequest size={14} /> PRs</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_users} onChange={(e) => setAction("migrate_users", e.target.checked)} />
              <span className="text-sm font-medium flex items-center gap-1"><Users size={14} /> Users</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Specific branches (comma or newline separated)</label>
            <textarea
              rows={3}
              className="w-full p-2 border rounded-md"
              value={specificBranchesInput}
              onChange={(e) => setSpecificBranchesInput(e.target.value)}
              placeholder="main, release/1.0"
            />
          </div>
        </div>

        <button
          onClick={handleAction}
          disabled={loading || !canSubmit}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white shadow-lg transition-all ${loading || !canSubmit ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"}`}
        >
          {loading ? <Loader2 className="animate-spin inline mr-2" /> : <Clock className="inline mr-2" size={20} />}
          {loading ? "Processing..." : syncMode === "manual" ? "Start Manual Sync" : "Enable Scheduled Sync"}
        </button>

        <div className="bg-gray-900 rounded-xl p-6 font-mono text-xs text-green-400 min-h-[170px] shadow-inner">
          <div className="flex items-center gap-2 text-gray-500 mb-4 pb-2 border-b border-gray-800">
            <Terminal size={16} />
            <span>Migration Console</span>
          </div>
          <div className="space-y-1">
            {logs.length === 0 && <span className="text-gray-600">Console ready...</span>}
            {logs.map((log, i) => <div key={`log-${i}`}>{log}</div>)}
          </div>
        </div>

        <DocumentationSection />
      </div>
    </div>
  );
}

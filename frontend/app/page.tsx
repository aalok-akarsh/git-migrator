/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState } from "react";
import { 
  ArrowRight, 
  Loader2, 
  CheckCircle, 
  GitBranch, 
  AlertCircle, 
  Terminal, 
  Users, 
  GitPullRequest,
  Calendar,
  Clock
} from "lucide-react";

/**
 * Wholesome Documentation Component
 * Provides technical reasoning and setup instructions directly in the UI.
 */
const WholesomeDocumentation = () => {
  return (
    <div className="mt-16 border-t border-gray-200 pt-12 pb-20">
      <div className="max-w-4xl mx-auto space-y-10">
        <section className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Wholesome Documentation</h2>
          <p className="text-gray-500 mt-2">Technical Overview and Setup Guide</p>
        </section>

        {/* System Architecture */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
             <Terminal className="text-indigo-600" size={20} /> System Architecture
          </h3>
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <ul className="list-disc list-inside text-sm text-indigo-900 space-y-2">
              <li><b>Frontend:</b> Next.js (React) for a professional, responsive web interface.</li>
              <li><b>Backend:</b> FastAPI (Python) for optimized Git and API operations.</li>
              <li><b>Sync Engine:</b> GitPython for high-fidelity repository mirroring.</li>
              <li><b>Scheduling:</b> APScheduler for automated, recurring sync intervals.</li>
            </ul>
          </div>
        </section>

        {/* Feature Checklist */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold">✅ Features Implemented</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "Manual Full Sync",
              "Scheduled Sync Automation",
              "Branch & Tag Migration",
              "Issue & PR Migration",
              "User Metadata Mapping",
              "Integrated Design Documentation"
            ].map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle className="text-green-500" size={16} /> {feature}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default function MigrationDashboard() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [syncMode, setSyncMode] = useState<"manual" | "scheduled">("manual");
  const [intervalMins, setIntervalMins] = useState(60);

  const [formData, setFormData] = useState({
    source_type: "github",
    source_token: "",
    source_repo_url: "",
    dest_type: "gitlab",
    dest_token: "",
    dest_repo_url: "",
    actions: {
      migrate_repo: true,
      migrate_issues: true,
      migrate_prs: true,
      migrate_users: true,
    },
  });

  const handleAction = async () => {
    setLoading(true);
    const endpoint = syncMode === "manual" ? "/migrate" : `/schedule?interval_minutes=${intervalMins}`;
    
    setLogs([
      `🚀 Initializing ${syncMode} sync...`, 
      syncMode === "scheduled" ? `⏰ Interval set to ${intervalMins} minutes.` : "📡 Connecting to backend..."
    ]);

    try {
      const response = await fetch(`http://127.0.0.1:8000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setLogs((prev) => [
          ...prev, 
          `✅ ${syncMode === "manual" ? "Migration triggered!" : "Sync scheduled successfully!"}`,
          `Job ID: ${data.job_id}`
        ]);
      } else {
        throw new Error(data.detail || "Action failed");
      }
    } catch (error: any) {
      setLogs((prev) => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-indigo-600">Git Migrator Tool</h1>
          <p className="text-gray-500 italic">Opstree Solutions Assessment</p>
        </div>

        {/* Sync Mode Selector */}
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
          {/* Source Panel */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-indigo-600">
              <GitBranch className="w-5 h-5" /> Source Provider
            </h2>
            <select className="w-full p-2 border rounded-md" value={formData.source_type} onChange={(e) => setFormData({...formData, source_type: e.target.value})}>
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">BitBucket</option>
            </select>
            <input type="text" placeholder="Source Repo URL" className="w-full p-2 border rounded-md" value={formData.source_repo_url} onChange={(e) => setFormData({...formData, source_repo_url: e.target.value})} />
            <input type="password" placeholder="Source Token" className="w-full p-2 border rounded-md" value={formData.source_token} onChange={(e) => setFormData({...formData, source_token: e.target.value})} />
          </div>

          {/* Destination Panel */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <h2 className="font-semibold text-lg flex items-center gap-2 text-indigo-600">
              <ArrowRight className="w-5 h-5" /> Destination Provider
            </h2>
            <select className="w-full p-2 border rounded-md" value={formData.dest_type} onChange={(e) => setFormData({...formData, dest_type: e.target.value})}>
              <option value="gitlab">GitLab</option>
              <option value="github">GitHub</option>
              <option value="bitbucket">BitBucket</option>
            </select>
            <input type="text" placeholder="Destination Repo URL" className="w-full p-2 border rounded-md" value={formData.dest_repo_url} onChange={(e) => setFormData({...formData, dest_repo_url: e.target.value})} />
            <input type="password" placeholder="Destination Token" className="w-full p-2 border rounded-md" value={formData.dest_token} onChange={(e) => setFormData({...formData, dest_token: e.target.value})} />
          </div>
        </div>

        {/* Scheduled Sync Configuration */}
        {syncMode === "scheduled" && (
          <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-100 flex items-center justify-between animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3">
              <Clock className="text-indigo-600" />
              <div>
                <p className="font-bold text-indigo-900">Sync Interval</p>
                <p className="text-xs text-indigo-700">Set the frequency for automated migration tasks.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                value={intervalMins} 
                onChange={(e) => setIntervalMins(Math.max(1, parseInt(e.target.value)))}
                className="w-20 p-2 border rounded-md text-center font-bold"
              />
              <span className="text-sm font-medium text-indigo-900">minutes</span>
            </div>
          </div>
        )}

        {/* Action Toggles */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_repo} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_repo: e.target.checked}})} />
              <span className="text-sm font-medium flex items-center gap-1"><GitBranch size={14}/> Repo</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_issues} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_issues: e.target.checked}})} />
              <span className="text-sm font-medium flex items-center gap-1"><AlertCircle size={14}/> Issues</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_prs} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_prs: e.target.checked}})} />
              <span className="text-sm font-medium flex items-center gap-1"><GitPullRequest size={14}/> PRs</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_users} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_users: e.target.checked}})} />
              <span className="text-sm font-medium flex items-center gap-1"><Users size={14}/> Users</span>
            </label>
        </div>

        <button
          onClick={handleAction}
          disabled={loading}
          className={`w-full py-4 rounded-xl font-bold text-lg text-white shadow-lg transition-all ${loading ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"}`}
        >
          {loading ? <Loader2 className="animate-spin inline mr-2" /> : (syncMode === "manual" ? <Calendar className="inline mr-2" size={20} /> : <Clock className="inline mr-2" size={20} />)}
          {loading ? "Processing..." : (syncMode === "manual" ? "Start Manual Full Sync" : "Enable Scheduled Sync")}
        </button>

        {/* Logs Console */}
        <div className="bg-gray-900 rounded-xl p-6 font-mono text-xs text-green-400 min-h-[150px] shadow-inner">
          <div className="flex items-center gap-2 text-gray-500 mb-4 pb-2 border-b border-gray-800">
            <Terminal size={16} />
            <span>Migration Console</span>
          </div>
          <div className="space-y-1">
             {logs.length === 0 && <span className="text-gray-600">Console ready for VCS migration...</span>}
             {logs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        </div>

        {/* Render Documentation */}
        <WholesomeDocumentation />

      </div>
    </div>
  );
}
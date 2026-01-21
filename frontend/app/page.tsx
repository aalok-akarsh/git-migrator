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
 * [cite_start]Documentation Component [cite: 9, 24]
 * Explains the system architecture and features for the interview assessment.
 */
const WholesomeDocumentation = () => {
  return (
    <div className="mt-16 border-t border-gray-200 pt-12 pb-20">
      <div className="max-w-4xl mx-auto space-y-10">
        <section className="text-center">
          [cite_start]<h2 className="text-2xl font-bold text-gray-900">Wholesome Documentation [cite: 9, 24]</h2>
          <p className="text-gray-500 mt-2">Technical Overview and Setup Guide</p>
        </section>

        {/* System Architecture */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold flex items-center gap-2">
             [cite_start]<Terminal className="text-indigo-600" size={20} /> System Architecture [cite: 7, 22]
          </h3>
          <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
            <ul className="list-disc list-inside text-sm text-indigo-900 space-y-2">
              [cite_start]<li><b>Frontend:</b> Next.js (React) for the &quot;Proper Web Interface&quot;[cite: 8, 23].</li>
              <li><b>Backend:</b> FastAPI (Python) for heavy Git operations.</li>
              [cite_start]<li><b>Sync Engine:</b> GitPython for repository mirroring[cite: 20].</li>
              [cite_start]<li><b>Scheduling:</b> APScheduler for recurring sync tasks[cite: 12].</li>
            </ul>
          </div>
        </section>

        [cite_start]{/* Feature Checklist [cite: 10, 13] */}
        <section className="space-y-3">
          [cite_start]<h3 className="text-lg font-bold">✅ Features Implemented [cite: 7]</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "Manual Full Sync",
              "Scheduled Sync",
              "Branch & Tag Migration",
              "Issue & PR Migration",
              "User Metadata Mapping",
              "Proper Web Interface"
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
  // Removed unused status state
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
      migrate_repo: true,   // Requirement: Repository [cite: 20]
      migrate_issues: true, // Requirement: Issues [cite: 19]
      migrate_prs: true,    // Requirement: PR [cite: 18]
      migrate_users: true,  // Requirement: Users [cite: 17]
    },
  });

  const handleAction = async () => {
    setLoading(true);
    // setStatus("processing"); // Removed unused status update
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
        // setStatus("success"); // Removed unused status update
        setLogs((prev) => [
          ...prev, 
          `✅ ${syncMode === "manual" ? "Migration triggered!" : "Sync scheduled successfully!"}`,
          `Job ID: ${data.job_id}`
        ]);
      } else {
        throw new Error(data.detail || "Action failed");
      }
    } catch (error: any) {
      // setStatus("error"); // Removed unused status update
      setLogs((prev) => [...prev, `❌ Error: ${error.message}`]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="text-center space-y-2">
          [cite_start]<h1 className="text-3xl font-bold text-indigo-600">Git Migrator Tool [cite: 4]</h1>
          [cite_start]<p className="text-gray-500 italic">Opstree Solutions Assessment [cite: 1]</p>
        </div>

        [cite_start]{/* Sync Mode Selector [cite: 11, 12] */}
        <div className="flex justify-center">
          <div className="inline-flex p-1 bg-gray-200 rounded-xl">
            <button 
              onClick={() => setSyncMode("manual")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${syncMode === "manual" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500"}`}
            >
              [cite_start]Manual Sync [cite: 11]
            </button>
            <button 
              onClick={() => setSyncMode("scheduled")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${syncMode === "scheduled" ? "bg-white shadow-sm text-indigo-600" : "text-gray-500"}`}
            >
              [cite_start]Scheduled Sync [cite: 12]
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          [cite_start]{/* Config Panels [cite: 5] */}
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
                [cite_start]<p className="font-bold text-indigo-900">Sync Interval [cite: 12]</p>
                <p className="text-xs text-indigo-700">Frequency of automated migration.</p>
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

        [cite_start]{/* Action Toggles [cite: 13, 17, 18, 19, 20] */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_repo} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_repo: e.target.checked}})} />
              [cite_start]<span className="text-sm font-medium flex items-center gap-1"><GitBranch size={14}/> Repo [cite: 20]</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_issues} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_issues: e.target.checked}})} />
              [cite_start]<span className="text-sm font-medium flex items-center gap-1"><AlertCircle size={14}/> Issues [cite: 19]</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_prs} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_prs: e.target.checked}})} />
              [cite_start]<span className="text-sm font-medium flex items-center gap-1"><GitPullRequest size={14}/> PRs [cite: 18]</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded-lg">
              <input type="checkbox" checked={formData.actions.migrate_users} onChange={(e) => setFormData({...formData, actions: {...formData.actions, migrate_users: e.target.checked}})} />
              [cite_start]<span className="text-sm font-medium flex items-center gap-1"><Users size={14}/> Users [cite: 17]</span>
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

        [cite_start]{/* Logs Console [cite: 8] */}
        <div className="bg-gray-900 rounded-xl p-6 font-mono text-xs text-green-400 min-h-37.5 shadow-inner">
          <div className="flex items-center gap-2 text-gray-500 mb-4 pb-2 border-b border-gray-800">
            <Terminal size={16} />
            <span>Migration Console</span>
          </div>
          <div className="space-y-1">
             [cite_start]{logs.length === 0 && <span className="text-gray-600">Console ready for VCS migration... [cite: 5]</span>}
             {logs.map((log, i) => <div key={i}>{log}</div>)}
          </div>
        </div>

        [cite_start]{/* --- Render Documentation Here [cite: 9, 24] --- */}
        <WholesomeDocumentation />

      </div>
    </div>
  );
}
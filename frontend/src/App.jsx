import { useState } from "react";
import MeetingRoom from "./pages/MeetingRoom";
import Dashboard from "./pages/Dashboard";
import MeetingDetail from "./pages/MeetingDetail";
import ImportPage from "./pages/ImportPage";
import AgentChat from "./pages/AgentChat";
import "./App.css";

const TABS = [
  {
    id: "record",
    label: "Enregistrement",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
      </svg>
    ),
  },
  {
    id: "meetings",
    label: "Reunions",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
  {
    id: "import",
    label: "Importer",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
  },
  {
    id: "agent",
    label: "Agent IA",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        <circle cx="18" cy="5" r="2" fill="currentColor" stroke="none"/>
        <path d="M18 3v4M16 5h4" strokeWidth="1.5"/>
      </svg>
    ),
  },
];

export default function App() {
  const [tab, setTab] = useState("record");
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const navigate = (target, sessionId = null) => {
    setSelectedSessionId(sessionId);
    setTab(target);
  };

  const activeTab = tab === "detail" ? "meetings" : tab;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" fill="#7C3AED" opacity="0.15"/>
            <path d="M9 12l2 2 4-4" stroke="#7C3AED" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="logo-text">SmartMeet</span>
        </div>
        <nav className="topbar-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`nav-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => navigate(t.id)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-content">
        {tab === "record"   && <MeetingRoom />}
        {tab === "meetings" && <Dashboard onViewMeeting={(id) => navigate("detail", id)} />}
        {tab === "detail"   && <MeetingDetail sessionId={selectedSessionId} onBack={() => navigate("meetings")} />}
        {tab === "import"   && <ImportPage onViewMeeting={(id) => navigate("detail", id)} />}
        {tab === "agent"    && <AgentChat />}
      </main>
    </div>
  );
}
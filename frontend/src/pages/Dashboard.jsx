import { useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";

const SPEAKER_COLORS = ["#6d28d9","#0891b2","#f97316","#22c55e","#ef4444","#f59e0b","#8b5cf6","#06b6d4"];

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function formatDuration(s) {
  if (s == null) return "—";
  return `${Math.floor(s/60)}m ${s%60}s`;
}

const STATUS = {
  active:    { label:"En cours",  cls:"badge-blue"  },
  completed: { label:"Terminée", cls:"badge-green" },
  error:     { label:"Erreur",    cls:"badge-red"   },
};

function useSpeakerStats(meetings) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!meetings.length) { setStats([]); return; }
    const completedIds = meetings.filter(m => m.status === "completed").slice(0, 5).map(m => m.session_id);
    if (!completedIds.length) { setStats([]); return; }

    setLoading(true);
    Promise.all(
      completedIds.map(id =>
        fetch(`${API_URL}/meetings/${id}/transcript`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    ).then(results => {
      const counts = {};
      results.flat().forEach(t => {
        const spk = t.speaker || "Inconnu";
        counts[spk] = (counts[spk] || 0) + (t.text?.split(" ").length || 0);
      });
      const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
      const sorted = Object.entries(counts)
        .map(([name, words]) => ({ name, words, pct: Math.round((words / total) * 100) }))
        .sort((a, b) => b.words - a.words)
        .slice(0, 6);
      setStats(sorted);
      setLoading(false);
    });
  }, [meetings]);

  return { stats, loading };
}

export default function Dashboard({ onViewMeeting }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const { stats: speakerStats, loading: statsLoading } = useSpeakerStats(meetings);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_URL}/meetings`);
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      setMeetings(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const completed  = meetings.filter(m => m.status === "completed").length;
  const active     = meetings.filter(m => m.status === "active").length;
  const totalMins  = meetings.reduce((a, m) => a + (m.duration_seconds || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tableau de bord</h1>
        <button className="btn" onClick={load}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Actualiser
        </button>
      </div>

      {/* ── Stats rapides ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{meetings.length}</div>
          <div className="stat-label">Réunions totales</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:"var(--green)" }}>{completed}</div>
          <div className="stat-label">Terminées</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color:"var(--accent)" }}>{active}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Math.floor(totalMins / 60)}h {Math.floor((totalMins % 3600)/60)}m</div>
          <div className="stat-label">Temps total enregistré</div>
        </div>
      </div>

      {/* ── Two-col layout ── */}
      <div className="two-col">

        {/* ── LEFT : liste des réunions ── */}
        <div>
          <div className="section-title">Historique des réunions</div>

          {error && (
            <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", color:"#dc2626", fontSize:13, marginBottom:16 }}>
              Impossible de charger : {error}
            </div>
          )}

          {loading && <div style={{ textAlign:"center", padding:40, color:"var(--text-3)" }}>Chargement...</div>}

          {!loading && !error && meetings.length === 0 && (
            <div className="card empty-state">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <p>Aucune réunion enregistrée.<br/><span style={{fontSize:12}}>Démarrez depuis l'onglet Enregistrement.</span></p>
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {meetings.map((m, idx) => {
              const st = STATUS[m.status] || { label:m.status, cls:"badge-amber" };
              const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
              const initials = m.title ? m.title.slice(0,2).toUpperCase() : `#${m.id}`;
              return (
                <div
                  key={m.id}
                  className="card"
                  style={{ padding:"14px 18px", cursor:"pointer", transition:"box-shadow .15s" }}
                  onClick={() => onViewMeeting(m.session_id)}
                  onMouseEnter={e => e.currentTarget.style.boxShadow="var(--shadow-md)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow="var(--shadow)"}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    {/* Avatar */}
                    <div style={{ width:38, height:38, borderRadius:9, background:color+"18", color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, flexShrink:0 }}>
                      {initials}
                    </div>
                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:14, color:"var(--text)", marginBottom:3 }}>
                        {m.title || `Réunion #${m.id}`}
                      </div>
                      <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", gap:14, flexWrap:"wrap" }}>
                        <span>📅 {formatDate(m.started_at)}</span>
                        <span>⏱ {formatDuration(m.duration_seconds)}</span>
                        <span>👥 {m.num_speakers ?? 0} intervenant{m.num_speakers !== 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT : Speaker dashboard ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Qui parle le plus */}
          <div className="card" style={{ padding:"20px 22px" }}>
            <div className="section-title">🎤 Qui parle le plus ?</div>
            {statsLoading && <div style={{ color:"var(--text-3)", fontSize:13 }}>Analyse en cours...</div>}
            {!statsLoading && speakerStats.length === 0 && (
              <div style={{ color:"var(--text-3)", fontSize:13, textAlign:"center", padding:"20px 0" }}>
                Aucune donnée disponible.<br/>
                <span style={{fontSize:12}}>Terminez une réunion pour voir les stats.</span>
              </div>
            )}
            {speakerStats.map((s, i) => (
              <div key={s.name} className="speaker-bar-row">
                <div style={{ display:"flex", alignItems:"center", gap:8, width:130, flexShrink:0 }}>
                  <div style={{
                    width:26, height:26, borderRadius:"50%",
                    background:SPEAKER_COLORS[i % SPEAKER_COLORS.length]+"22",
                    color:SPEAKER_COLORS[i % SPEAKER_COLORS.length],
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, fontWeight:700, flexShrink:0,
                  }}>
                    {s.name.slice(0,2).toUpperCase()}
                  </div>
                  <span className="speaker-bar-label" style={{ width:"auto" }}>{s.name}</span>
                </div>
                <div className="speaker-bar-track">
                  <div
                    className="speaker-bar-fill"
                    style={{ width:`${s.pct}%`, background:SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}
                  />
                </div>
                <span className="speaker-bar-pct">{s.pct}%</span>
              </div>
            ))}
            {speakerStats.length > 0 && (
              <div style={{ fontSize:11, color:"var(--text-3)", marginTop:12, borderTop:"1px solid var(--border)", paddingTop:10 }}>
                Basé sur les {Math.min(meetings.filter(m=>m.status==="completed").length,5)} dernières réunions terminées · {speakerStats.reduce((a,s)=>a+s.words,0).toLocaleString()} mots analysés
              </div>
            )}
          </div>

          {/* Top speaker podium */}
          {speakerStats.length >= 1 && (
            <div className="card" style={{ padding:"20px 22px" }}>
              <div className="section-title">🏆 Top intervenants</div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {speakerStats.slice(0,3).map((s, i) => {
                  const medals = ["🥇","🥈","🥉"];
                  const color = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
                  return (
                    <div key={s.name} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:`${color}0d`, borderRadius:9, border:`1px solid ${color}22` }}>
                      <span style={{ fontSize:20 }}>{medals[i]}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:"var(--text)" }}>{s.name}</div>
                        <div style={{ fontSize:12, color:"var(--text-3)", marginTop:1 }}>{s.words.toLocaleString()} mots · {s.pct}% du temps de parole</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dernière réunion rapide */}
          {meetings.length > 0 && (
            <div className="card" style={{ padding:"20px 22px" }}>
              <div className="section-title">⚡ Dernière réunion</div>
              <div style={{ fontSize:14, color:"var(--text)", fontWeight:600, marginBottom:6 }}>
                {meetings[0].title || `Réunion #${meetings[0].id}`}
              </div>
              <div style={{ fontSize:12, color:"var(--text-3)", display:"flex", flexDirection:"column", gap:4 }}>
                <span>📅 {formatDate(meetings[0].started_at)}</span>
                <span>⏱ Durée : {formatDuration(meetings[0].duration_seconds)}</span>
                <span>👥 {meetings[0].num_speakers ?? 0} intervenant{meetings[0].num_speakers !== 1 ? "s" : ""}</span>
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop:14, width:"100%", justifyContent:"center", fontSize:13 }}
                onClick={() => onViewMeeting(meetings[0].session_id)}
              >
                Voir le détail →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
import { useState, useEffect, useMemo } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";

const SPEAKER_COLORS = [
  "#6d28d9","#0891b2","#f97316","#22c55e",
  "#ef4444","#f59e0b","#8b5cf6","#06b6d4",
];

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
}

const SENTIMENT_COLOR = {
  positive: "var(--green)",
  neutral:  "var(--text-3)",
  negative: "var(--red)",
};


function DonutChart({ segments, size = 120 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38, stroke = size * 0.18;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = segments.map((s) => {
    const dash = (s.pct / 100) * circumference;
    const slice = { ...s, dashArray: `${dash} ${circumference - dash}`, dashOffset: -offset };
    offset += dash;
    return slice;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      {slices.map((s, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={stroke}
          strokeDasharray={s.dashArray}
          strokeDashoffset={s.dashOffset}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}


function SpeakerAnalytics({ transcript, speakerMap }) {
  const stats = useMemo(() => {
    if (!transcript.length) return [];
    const map = {};
    transcript.forEach(t => {
      const sp = t.speaker || "Inconnu";
      if (!map[sp]) map[sp] = { words: 0, segments: 0, sentiments: { positive:0, neutral:0, negative:0 } };
      map[sp].words    += t.text?.split(" ").length || 0;
      map[sp].segments += 1;
      const sl = t.sentiment_label || "neutral";
      if (map[sp].sentiments[sl] !== undefined) map[sp].sentiments[sl]++;
    });
    const total = Object.values(map).reduce((a, v) => a + v.words, 0) || 1;
    return Object.entries(map)
      .map(([name, v]) => ({
        name,
        words:    v.words,
        segments: v.segments,
        pct:      Math.round((v.words / total) * 100),
        color:    speakerMap[name] || SPEAKER_COLORS[0],
        dominant: Object.entries(v.sentiments).sort((a,b) => b[1]-a[1])[0][0],
      }))
      .sort((a, b) => b.words - a.words);
  }, [transcript, speakerMap]);

  if (!stats.length) return (
    <div style={{ textAlign:"center", padding:"24px 0", color:"var(--text-3)", fontSize:13 }}>
      Aucune donnée de transcription.
    </div>
  );

  const donutSegs = stats.map(s => ({ pct: s.pct, color: s.color }));
  const medals = ["🥇","🥈","🥉"];
  const totalWords = stats.reduce((a, s) => a + s.words, 0);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

      {/* ── Donut + légende ── */}
      <div className="card" style={{ padding:"20px 22px" }}>
        <div className="section-title">🎤 Répartition de la parole</div>

        <div style={{ display:"flex", alignItems:"center", gap:20, marginBottom:18 }}>
          {/* Donut */}
          <div style={{ position:"relative", flexShrink:0 }}>
            <DonutChart segments={donutSegs} size={110} />
            <div style={{
              position:"absolute", inset:0,
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              fontSize:11, color:"var(--text-3)", lineHeight:1.3,
            }}>
              <span style={{ fontSize:17, fontWeight:800, color:"var(--text)" }}>{stats.length}</span>
              <span>intervenant{stats.length > 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Légende couleurs */}
          <div style={{ display:"flex", flexDirection:"column", gap:7, flex:1 }}>
            {stats.map(s => (
              <div key={s.name} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:s.color, flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.name}</span>
                <span style={{ fontSize:12, color:"var(--text-3)", fontWeight:600 }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Barres horizontales */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {stats.map((s, i) => (
            <div key={s.name}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{
                    width:26, height:26, borderRadius:"50%",
                    background: s.color + "20", color: s.color,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:10, fontWeight:800, flexShrink:0,
                  }}>
                    {s.name.slice(0,2).toUpperCase()}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:"var(--text)" }}>{s.name}</span>
                  {i === 0 && <span style={{ fontSize:10, background:s.color+"18", color:s.color, padding:"1px 7px", borderRadius:999, fontWeight:700 }}>Top</span>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <span style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>{s.pct}%</span>
                  <span style={{ fontSize:11, color:"var(--text-3)", marginLeft:6 }}>{s.words} mots</span>
                </div>
              </div>
              <div style={{ height:8, background:"var(--surface2)", borderRadius:4, overflow:"hidden" }}>
                <div style={{
                  height:"100%", width:`${s.pct}%`,
                  background: s.color,
                  borderRadius:4,
                  transition:"width .7s ease",
                }} />
              </div>
              <div style={{ display:"flex", gap:12, marginTop:4 }}>
                <span style={{ fontSize:11, color:"var(--text-3)" }}>{s.segments} segment{s.segments > 1 ? "s" : ""}</span>
                <span style={{ fontSize:11, color:"var(--text-3)" }}>
                  Tonalité : {s.dominant === "positive" ? "😊 Positive" : s.dominant === "negative" ? "😟 Négative" : "😐 Neutre"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop:14, paddingTop:12, borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text-3)" }}>
          Total : {totalWords.toLocaleString()} mots · {transcript.length} segments
        </div>
      </div>

      {/* ── Podium ── */}
      {stats.length >= 2 && (
        <div className="card" style={{ padding:"20px 22px" }}>
          <div className="section-title">🏆 Classement</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {stats.slice(0, 3).map((s, i) => (
              <div key={s.name} style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"10px 14px",
                background: s.color + "10",
                border: `1px solid ${s.color}25`,
                borderRadius: 10,
              }}>
                <span style={{ fontSize:20 }}>{medals[i] || "🎖"}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:"var(--text)" }}>{s.name}</div>
                  <div style={{ fontSize:11, color:"var(--text-3)", marginTop:1 }}>
                    {s.words.toLocaleString()} mots · {s.pct}% · {s.segments} seg.
                  </div>
                </div>
                <div style={{
                  width:36, height:36, borderRadius:"50%",
                  background: s.color, color:"#fff",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:13, fontWeight:800,
                }}>
                  {s.pct}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Analyse des sentiments ── */}
      <div className="card" style={{ padding:"20px 22px" }}>
        <div className="section-title">😊 Sentiments par intervenant</div>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {stats.map(s => {
            const segs = transcript.filter(t => t.speaker === s.name);
            const counts = { positive:0, neutral:0, negative:0 };
            segs.forEach(t => { if (counts[t.sentiment_label] !== undefined) counts[t.sentiment_label]++; });
            const tot = segs.length || 1;
            return (
              <div key={s.name}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:s.color }} />
                  <span style={{ fontSize:12, fontWeight:700, color:"var(--text)" }}>{s.name}</span>
                </div>
                <div style={{ display:"flex", gap:2, height:10, borderRadius:5, overflow:"hidden", background:"var(--surface2)" }}>
                  {[
                    { key:"positive", color:"var(--green)" },
                    { key:"neutral",  color:"var(--text-3)" },
                    { key:"negative", color:"var(--red)" },
                  ].map(item => (
                    <div
                      key={item.key}
                      title={`${item.key}: ${Math.round((counts[item.key]/tot)*100)}%`}
                      style={{
                        width: `${Math.round((counts[item.key]/tot)*100)}%`,
                        background: item.color,
                        transition: "width .5s",
                        minWidth: counts[item.key] ? 3 : 0,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display:"flex", gap:14, marginTop:4, fontSize:11, color:"var(--text-3)" }}>
                  <span>😊 {Math.round((counts.positive/tot)*100)}%</span>
                  <span>😐 {Math.round((counts.neutral/tot)*100)}%</span>
                  <span>😟 {Math.round((counts.negative/tot)*100)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


export default function MeetingDetail({ sessionId, onBack }) {
  const [transcript, setTranscript]     = useState([]);
  const [summary, setSummary]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [error, setError]               = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const load = async () => {
      setLoading(true); setError(null); setSummaryError(null);
      try {
        const r = await fetch(`${API_URL}/meetings/${sessionId}/transcript`);
        if (!r.ok) throw new Error(`Erreur ${r.status}`);
        setTranscript(await r.json());
      } catch (e) { setError(e.message); }
      try {
        const r = await fetch(`${API_URL}/meetings/${sessionId}/summary`);
        if (r.status === 404) setSummaryError("Résumé non encore disponible.");
        else if (!r.ok) throw new Error(`Erreur ${r.status}`);
        else {
          const data = await r.json();
          if (typeof data.content === "string") {
            try { data.content = JSON.parse(data.content); } catch { data.content = { executive_summary: data.content }; }
          }
          setSummary(data);
        }
      } catch (e) { setSummaryError(e.message); }
      setLoading(false);
    };
    load();
  }, [sessionId]);

  const regenerate = async () => {
    setRegenerating(true); setSummaryError(null);
    try {
      await fetch(`${API_URL}/meetings/${sessionId}/regenerate-summary`, { method:"POST" });
      const r = await fetch(`${API_URL}/meetings/${sessionId}/summary`);
      if (r.ok) {
        const data = await r.json();
        if (typeof data.content === "string") {
          try { data.content = JSON.parse(data.content); } catch { data.content = { executive_summary: data.content }; }
        }
        setSummary(data);
      }
    } catch (e) { setSummaryError(e.message); }
    setRegenerating(false);
  };

  const speakers    = useMemo(() => [...new Set(transcript.map(t => t.speaker))], [transcript]);
  const speakerMap  = useMemo(() => Object.fromEntries(speakers.map((s, i) => [s, SPEAKER_COLORS[i % SPEAKER_COLORS.length]])), [speakers]);
  const filtered    = activeFilter === "all" ? transcript : transcript.filter(t => t.speaker === activeFilter);
  const content     = summary?.content || {};

  if (!sessionId) return (
    <div>
      <button className="btn-back" onClick={onBack}>← Retour</button>
      <div className="card empty-state">Aucune réunion sélectionnée.</div>
    </div>
  );

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <button className="btn-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Retour
          </button>
          <div>
            <h1 className="page-title">{content.title || "Détail de la réunion"}</h1>
            <p className="page-subtitle">Session {sessionId.slice(0, 8)}...</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn" onClick={regenerate} disabled={regenerating} style={{ fontSize:13 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            {regenerating ? "Génération..." : "Regénérer le résumé"}
          </button>
          <button className="btn btn-ghost" style={{ fontSize:13 }}
            onClick={() => navigator.clipboard.writeText(transcript.map(t=>`[${t.speaker}] ${t.text}`).join("\n"))}>
            📋 Copier
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign:"center", padding:40, color:"var(--text-3)" }}>Chargement...</div>}
      {error && <div style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:8, padding:"10px 14px", color:"#dc2626", fontSize:14, marginBottom:16 }}>{error}</div>}

      <div className="two-col">

        {/* ── LEFT : Résumé + Transcription ── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Résumé */}
          <div className="card" style={{ padding:24 }}>
            <div className="section-title">📋 Résumé</div>
            {summaryError && <p style={{ fontSize:13, color:"var(--text-3)", marginBottom:8 }}>{summaryError}</p>}
            {summary && (
              <div>
                {content.executive_summary && (
                  <p style={{ fontSize:14, lineHeight:1.7, color:"var(--text-2)", fontStyle:"italic", borderLeft:"3px solid var(--accent)", paddingLeft:14, marginBottom:16 }}>
                    {content.executive_summary}
                  </p>
                )}
                {Array.isArray(content.key_points) && content.key_points.length > 0 && (
                  <>
                    <div className="section-subtitle">Points clés</div>
                    <ul className="clean-list">{content.key_points.map((pt,i)=><li key={i}>{pt}</li>)}</ul>
                  </>
                )}
                {Array.isArray(content.decisions) && content.decisions.length > 0 && (
                  <>
                    <div className="section-subtitle">Décisions</div>
                    <ul className="clean-list">{content.decisions.map((d,i)=><li key={i}>{d}</li>)}</ul>
                  </>
                )}
                {Array.isArray(summary.action_items) && summary.action_items.length > 0 && (
                  <>
                    <div className="section-subtitle">Actions</div>
                    <ul className="clean-list">
                      {summary.action_items.map((item,i)=>(
                        <li key={i}><strong>{item.owner||item.responsable}</strong> : {item.task||item.tache}</li>
                      ))}
                    </ul>
                  </>
                )}
                {content.ambiance && (
                  <div style={{ marginTop:14, fontSize:13, color:"var(--text-3)" }}>
                    Ambiance : <strong style={{ color:"var(--text-2)" }}>{content.ambiance}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transcription */}
          <div className="card" style={{ padding:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <div className="section-title" style={{ marginBottom:0 }}>💬 Transcription ({transcript.length})</div>
              {speakers.length > 1 && (
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  <button
                    className="btn"
                    style={{ fontSize:11, padding:"3px 10px", background:activeFilter==="all"?"var(--accent)":"", color:activeFilter==="all"?"#fff":"var(--text-2)" }}
                    onClick={() => setActiveFilter("all")}
                  >Tous</button>
                  {speakers.map(spk => (
                    <button key={spk} className="btn"
                      style={{ fontSize:11, padding:"3px 10px", background:activeFilter===spk?speakerMap[spk]:"", color:activeFilter===spk?"#fff":"var(--text-2)", borderColor:speakerMap[spk] }}
                      onClick={() => setActiveFilter(activeFilter===spk?"all":spk)}
                    >{spk}</button>
                  ))}
                </div>
              )}
            </div>

            {!loading && filtered.length === 0 && (
              <p style={{ fontSize:13, color:"var(--text-3)" }}>Aucune transcription disponible.</p>
            )}

            <div className="transcript-scroll" style={{ maxHeight:520, overflowY:"auto", paddingRight:4 }}>
              {filtered.map((t, i) => (
                <div key={i} className="transcript-item">
                  <div className="transcript-meta">
                    <div style={{
                      width:24, height:24, borderRadius:"50%",
                      background:(speakerMap[t.speaker]||"#6d28d9")+"22",
                      color:speakerMap[t.speaker]||"#6d28d9",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9, fontWeight:800, flexShrink:0,
                    }}>{t.speaker?.slice(0,2).toUpperCase()}</div>
                    <span className="transcript-speaker" style={{ color:speakerMap[t.speaker]||"var(--text)" }}>{t.speaker}</span>
                    <span>{formatTime(t.timestamp)}</span>
                    <span style={{ textTransform:"uppercase", letterSpacing:".05em", fontSize:10 }}>{t.language}</span>
                    <span className="dot" style={{ background:SENTIMENT_COLOR[t.sentiment_label]||"var(--text-3)" }} title={t.sentiment_label}/>
                    <span style={{ marginLeft:"auto", fontSize:11, color:"var(--text-3)" }}>{t.text?.split(" ").length||0} mots</span>
                  </div>
                  <p className="transcript-text">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT : Tableau de bord par intervenant ── */}
        <SpeakerAnalytics transcript={transcript} speakerMap={speakerMap} />
      </div>
    </div>
  );
}
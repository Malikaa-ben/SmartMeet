import { useState, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api/v1";
const SPEAKER_COLORS = ["#6d28d9","#0891b2","#f97316","#22c55e","#ef4444","#f59e0b","#8b5cf6","#06b6d4"];

export default function ImportPage() {
  const [file, setFile]           = useState(null);
  const [dragOver, setDragOver]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const fileInputRef              = useRef(null);

  const handleFile = (f) => { if (!f) return; setFile(f); setResult(null); setError(null); };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true); setProgress(10); setError(null); setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const interval = setInterval(() => setProgress(p => Math.min(p + 5, 88)), 1200);

    try {
      const res = await fetch(`${API_URL}/transcribe-file`, { method: "POST", body: formData });
      clearInterval(interval);
      setProgress(100);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erreur HTTP ${res.status}`);
      }
      setResult(await res.json());
      setActiveTab("summary");
    } catch (e) {
      clearInterval(interval);
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  // Speaker color map
  const speakerMap = {};
  if (result?.segments) {
    [...new Set(result.segments.map(s => s.speaker).filter(Boolean))].forEach((sp, i) => {
      speakerMap[sp] = SPEAKER_COLORS[i % SPEAKER_COLORS.length];
    });
  }

  const summary = result?.summary;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Importer un fichier</h1>
      </div>

      {/* ── Zone upload ── */}
      {!file && (
        <div
          className={`upload-zone card ${dragOver ? "drag-over" : ""}`}
          style={{ maxWidth: 600, margin: "0 auto" }}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="audio/*,video/*" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 44, marginBottom: 14 }}>📂</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 8 }}>Glissez-déposez votre fichier</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 18 }}>Formats supportés : MP3, WAV, MP4, M4A, OGG, WEBM</div>
          <button className="btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>Choisir un fichier</button>
        </div>
      )}

      {/* ── Fichier sélectionné ── */}
      {file && !result && (
        <div className="card" style={{ padding: "18px 22px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 10, background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                {file.type.startsWith("video/") ? "🎬" : "🎵"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{(file.size/1024/1024).toFixed(1)} MB · {file.type}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => { setFile(null); setResult(null); setError(null); }}>✕ Supprimer</button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
                {importing ? "⏳ Transcription en cours..." : "🚀 Transcrire"}
              </button>
            </div>
          </div>

          {importing && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}>
                Whisper analyse le fichier — cela peut prendre quelques minutes...
              </div>
              <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--accent), #06b6d4)", borderRadius: 3, transition: "width .5s ease" }} />
              </div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, textAlign: "right" }}>{progress}%</div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="card" style={{ padding: "16px 20px", borderColor: "var(--red)", border: "1px solid", marginBottom: 16 }}>
          <div style={{ fontWeight: 600, color: "var(--red)", marginBottom: 6 }}>⚠ Erreur</div>
          <div style={{ fontSize: 13, color: "var(--text-2)" }}>{error}</div>
        </div>
      )}

      {/* ── Résultats ── */}
      {result && (
        <div>
          {/* Fichier info bar */}
          <div className="card" style={{ padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>{file?.type?.startsWith("video/") ? "🎬" : "🎵"}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{result.filename}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                  {result.segments?.length} segments · {result.duration}s · Langue : {result.language?.toUpperCase()}
                </div>
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setFile(null); setResult(null); }}>
              ✕ Nouveau fichier
            </button>
          </div>

          <div className="two-col">

            {/* ── LEFT : onglets résumé / transcription ── */}
            <div>
              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
                {["summary", "transcript"].map(t => (
                  <button key={t} onClick={() => setActiveTab(t)} style={{
                    padding: "8px 16px", border: "none", background: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 500,
                    color: activeTab === t ? "var(--accent)" : "var(--text-2)",
                    borderBottom: activeTab === t ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: -1, transition: "color .15s",
                  }}>
                    {t === "summary" ? "📋 Résumé" : `💬 Transcription (${result.segments?.length})`}
                  </button>
                ))}
              </div>

              {/* ── Résumé tab ── */}
              {activeTab === "summary" && (
                <div className="card" style={{ padding: 24 }}>
                  {!summary ? (
                    <p style={{ color: "var(--text-3)", fontSize: 13 }}>Résumé non disponible (Ollama hors ligne).</p>
                  ) : (
                    <div>
                      {/* Titre */}
                      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: "var(--text)" }}>
                        {summary.title || result.filename}
                      </h2>

                      {/* Résumé exécutif en paragraphe */}
                      {summary.executive_summary && (
                        <div style={{ marginBottom: 20 }}>
                          <div className="section-title">Résumé</div>
                          <p style={{
                            fontSize: 14, lineHeight: 1.75, color: "var(--text-2)",
                            fontStyle: "italic",
                            borderLeft: "3px solid var(--accent)",
                            paddingLeft: 14,
                          }}>
                            {summary.executive_summary}
                          </p>
                        </div>
                      )}

                      {/* Points clés */}
                      {Array.isArray(summary.key_points) && summary.key_points.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div className="section-title">Points clés</div>
                          <ul className="clean-list">
                            {summary.key_points.map((pt, i) => (
                              <li key={i}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Décisions */}
                      {Array.isArray(summary.decisions) && summary.decisions.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                          <div className="section-title">Décisions</div>
                          <ul className="clean-list">
                            {summary.decisions.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Ambiance */}
                      {summary.ambiance && (
                        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                          Ambiance : <strong style={{ color: "var(--text-2)", textTransform: "capitalize" }}>{summary.ambiance}</strong>
                        </div>
                      )}

                      {/* Note Ollama KO */}
                      {summary.note && (
                        <div style={{ marginTop: 12, fontSize: 12, color: "var(--yellow)", background: "#fef9c3", padding: "8px 12px", borderRadius: 6 }}>
                          ⚠ {summary.note}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Transcription tab ── */}
              {activeTab === "transcript" && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div className="section-title" style={{ marginBottom: 0 }}>Transcription complète</div>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => navigator.clipboard.writeText(
                        result.segments.map(s => `[${s.speaker}] ${s.text}`).join("\n")
                      )}>
                      📋 Copier
                    </button>
                  </div>
                  <div className="transcript-scroll" style={{ maxHeight: 520, overflowY: "auto", paddingRight: 4 }}>
                    {result.segments.map((seg, i) => {
                      const color = speakerMap[seg.speaker] || "#6d28d9";
                      return (
                        <div key={i} className="transcript-item">
                          <div className="transcript-meta">
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: color+"22", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0 }}>
                              {seg.speaker?.slice(0,2).toUpperCase()}
                            </div>
                            <span className="transcript-speaker" style={{ color }}>{seg.speaker}</span>
                            {seg.start != null && (
                              <span>{Math.floor(seg.start/60)}:{String(Math.floor(seg.start%60)).padStart(2,"0")}</span>
                            )}
                            <span style={{ textTransform: "uppercase", fontSize: 10 }}>{seg.language}</span>
                          </div>
                          <p className="transcript-text">{seg.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT : stats fichier ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Infos générales */}
              <div className="card" style={{ padding: "20px 22px" }}>
                <div className="section-title">📊 Informations</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: "var(--text-2)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Fichier</span>
                    <span style={{ fontWeight: 600, maxWidth: 180, textAlign: "right", wordBreak: "break-word" }}>{result.filename}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Durée</span>
                    <span style={{ fontWeight: 600 }}>{Math.floor(result.duration/60)}m {Math.floor(result.duration%60)}s</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Langue</span>
                    <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{result.language}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Segments</span>
                    <span style={{ fontWeight: 600 }}>{result.segments?.length}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-3)" }}>Intervenants</span>
                    <span style={{ fontWeight: 600 }}>{Object.keys(speakerMap).length}</span>
                  </div>
                </div>
              </div>

              {/* Répartition intervenants */}
              {Object.keys(speakerMap).length > 0 && (
                <div className="card" style={{ padding: "20px 22px" }}>
                  <div className="section-title">🎤 Intervenants</div>
                  {(() => {
                    const wordCount = {};
                    result.segments.forEach(s => {
                      wordCount[s.speaker] = (wordCount[s.speaker]||0) + (s.text?.split(" ").length||0);
                    });
                    const total = Object.values(wordCount).reduce((a,b)=>a+b,0)||1;
                    return Object.entries(wordCount)
                      .sort((a,b)=>b[1]-a[1])
                      .map(([name, words]) => {
                        const pct = Math.round((words/total)*100);
                        const color = speakerMap[name]||"#6d28d9";
                        return (
                          <div key={name} style={{ marginBottom: 12 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                              <div style={{ width: 22, height: 22, borderRadius: "50%", background: color+"22", color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800 }}>
                                {name.slice(0,2).toUpperCase()}
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{name}</span>
                              <span style={{ fontSize: 12, color: "var(--text-3)" }}>{pct}%</span>
                            </div>
                            <div style={{ height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .6s" }} />
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>
              )}

              {/* Guide si pas encore de résultat */}
              {!result && (
                <div className="card" style={{ padding: "20px 22px" }}>
                  <div className="section-title">ℹ️ Comment ça marche</div>
                  {[
                    { n:"1", label:"Choisissez un fichier", desc:"Audio (MP3, WAV, M4A) ou vidéo (MP4, WEBM)." },
                    { n:"2", label:"Lancez la transcription", desc:"Whisper transcrit et identifie les intervenants." },
                    { n:"3", label:"Consultez le résumé", desc:"Résumé en paragraphe + points clés générés par Ollama." },
                  ].map(s => (
                    <div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
                      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{s.n}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{s.label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)" }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import { useRef, useEffect } from "react";
import { useAudioStream } from "../hooks/useAudioStream";

export default function MeetingRoom() {
  const {
    isRecording,
    sessionId,
    transcripts,
    connectionState,
    error,
    debugInfo,
    startRecording,
    stopRecording,
  } = useAudioStream();

  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const copyTranscript = () => {
    const text = transcripts.map(t => `[${t.speaker}] ${t.text}`).join("\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Transcription en direct</h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isRecording ? (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "#ef4444", fontWeight: 600 }}>
              <span className="dot dot-red" />
              Enregistrement
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--text-3)" }}>
              <span className="dot dot-gray" />
              {connectionState === "connecting" ? "Connexion..." : "En attente"}
            </div>
          )}

          {transcripts.length > 0 && (
            <button className="btn" onClick={copyTranscript}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copier
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 18, color: "#dc2626", fontSize: 14.5 }}>
          {error}
        </div>
      )}

      {/* ── Main card ── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isRecording && (
              <div className="waveform">
                {[1,2,3,4,5].map(i => <div key={i} className="waveform-bar" />)}
              </div>
            )}
            <span style={{ fontSize: 14, color: "var(--text-2)", fontWeight: 600 }}>
              {isRecording ? "EN DIRECT" : sessionId ? `Session : ${sessionId.slice(0, 8)}...` : "Prêt à enregistrer"}
            </span>
          </div>
          {isRecording && debugInfo && (
            <span style={{ fontSize: 12, color: "var(--text-3)", fontFamily: "monospace" }}>
              RMS: {debugInfo.lastRMS} · {debugInfo.chunksSent} chunks
            </span>
          )}
        </div>

        {/* Transcript zone */}
        <div style={{ padding: 20, minHeight: 260 }}>
          {transcripts.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 16px", textAlign: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              <p style={{ fontSize: 15.5, color: "var(--text-3)" }}>
                {isRecording
                  ? "En attente de la parole..."
                  : "Démarrez l'enregistrement pour commencer la transcription."}
              </p>
            </div>
          ) : (
            <div className="transcript-scroll">
              {transcripts.map((t) => (
                <div key={t.id} className="transcript-item">
                  <div className="transcript-meta">
                    <span className="transcript-speaker">{t.speaker}</span>
                    <span style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.05em" }}>{t.language}</span>
                    {t.sentiment?.emoji && <span>{t.sentiment.emoji}</span>}
                    <span style={{ marginLeft: "auto" }}>
                      {t.timestamp ? new Date(t.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  <p className="transcript-text">{t.text}</p>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div style={{ padding: "18px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "center" }}>
          {!isRecording ? (
            <button className="btn btn-primary" style={{ padding: "11px 28px", fontSize: 15 }} onClick={startRecording}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
              </svg>
              Démarrer l'enregistrement
            </button>
          ) : (
            <button className="btn btn-danger" style={{ padding: "11px 28px", fontSize: 15 }} onClick={stopRecording}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2"/>
              </svg>
              Arrêter la réunion
            </button>
          )}
        </div>
      </div>

      {transcripts.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 13, color: "var(--text-3)", textAlign: "center" }}>
          {transcripts.length} segment{transcripts.length > 1 ? "s" : ""} transcrits
          {sessionId && ` · Session ${sessionId.slice(0, 8)}...`}
        </div>
      )}
    </div>
  );
}
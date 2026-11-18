import { useState, useRef, useEffect } from "react";

const API_URL = "/api/v1/agent/ask"; 



const SUGGESTIONS = [
  "Combien de reunions ont eu lieu ?",
  "Qui parle le plus ?",
  "Quel est le sentiment dominant ?",
  "Quelle est la derniere reunion ?",
  "Quelle reunion a dure le plus longtemps ?",
];

export default function AgentChat() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ask = async (q) => {
    const text = (q || question).trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });

      if (!res.ok) throw new Error(`Erreur serveur : ${res.status}`);

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: data.answer || "Aucune reponse generee.",
          sql: data.debug?.sql_generated,
        },
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: "agent", text: "Erreur : " + err.message, isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.headerIcon}>🤖</div>
          <div>
            <h2 style={styles.headerTitle}>Agent IA SmartMeet</h2>
            <p style={styles.headerSub}>
              Posez une question en langage naturel sur vos reunions
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={reset} style={styles.resetBtn}>
            Nouvelle conversation
          </button>
        )}
      </div>

      {/* Suggestions */}
      {messages.length === 0 && (
        <div style={styles.suggestionsSection}>
          <p style={styles.suggestionsLabel}>Questions suggérees :</p>
          <div style={styles.suggestions}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} style={styles.chip} onClick={() => ask(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={styles.chatBox}>
        {messages.length === 0 && (
          <div style={styles.empty}>
            <span style={{ fontSize: 48 }}>💬</span>
            <p style={{ color: "#94a3b8", marginTop: 12 }}>
              Commencez par poser une question...
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.msgRow,
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            {m.role === "agent" && (
              <div style={styles.avatar}>🤖</div>
            )}
            <div style={{ maxWidth: "75%" }}>
              <div
                style={{
                  ...styles.bubble,
                  ...(m.role === "user" ? styles.userBubble : styles.agentBubble),
                  ...(m.isError ? styles.errorBubble : {}),
                }}
              >
                {m.text}
              </div>
              {m.sql && m.sql.startsWith("SELECT") && (
                <div style={styles.sqlBox}>
                  <span style={styles.sqlLabel}>SQL genere :</span>
                  <code style={styles.sqlCode}>{m.sql}</code>
                </div>
              )}
            </div>
            {m.role === "user" && (
              <div style={styles.avatarUser}>👤</div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
            <div style={styles.avatar}>🤖</div>
            <div style={{ ...styles.bubble, ...styles.agentBubble }}>
              <span style={styles.dots}>
                <span>.</span><span>.</span><span>.</span>
              </span>
              &nbsp;L'agent reflechit...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ex: Combien de reunions ont eu lieu cette semaine ?"
          style={styles.input}
          disabled={loading}
        />
        <button
          onClick={() => ask()}
          disabled={loading || !question.trim()}
          style={{
            ...styles.sendBtn,
            opacity: loading || !question.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "Envoyer"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 780,
    margin: "0 auto",
    padding: "24px 16px",
    fontFamily: "'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    height: "calc(100vh - 80px)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: 16,
    padding: "20px 24px",
    color: "white",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  headerIcon: { fontSize: 40 },
  headerTitle: { margin: 0, fontSize: 22, fontWeight: 700 },
  headerSub: { margin: "4px 0 0", fontSize: 13, opacity: 0.85 },
  resetBtn: {
    background: "rgba(255,255,255,0.2)",
    border: "1px solid rgba(255,255,255,0.4)",
    color: "white",
    padding: "8px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
  },
  suggestionsSection: { padding: "0 4px" },
  suggestionsLabel: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  suggestions: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
    color: "#475569",
    transition: "all 0.2s",
  },
  chatBox: {
    flex: 1,
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "60px 0",
  },
  msgRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
  },
  avatar: {
    fontSize: 24,
    flexShrink: 0,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ede9fe",
    borderRadius: "50%",
  },
  avatarUser: {
    fontSize: 20,
    flexShrink: 0,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#dbeafe",
    borderRadius: "50%",
  },
  bubble: {
    padding: "10px 16px",
    borderRadius: 16,
    fontSize: 14,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
  },
  userBubble: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
    borderBottomRightRadius: 4,
  },
  agentBubble: {
    background: "white",
    color: "#1e293b",
    border: "1px solid #e2e8f0",
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
  },
  sqlBox: {
    marginTop: 6,
    background: "#1e293b",
    borderRadius: 8,
    padding: "8px 12px",
  },
  sqlLabel: {
    fontSize: 10,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 1,
    display: "block",
    marginBottom: 4,
  },
  sqlCode: {
    fontSize: 11,
    color: "#7dd3fc",
    fontFamily: "monospace",
    wordBreak: "break-all",
  },
  inputRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    fontSize: 14,
    outline: "none",
    background: "white",
  },
  sendBtn: {
    padding: "12px 24px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "white",
    border: "none",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  dots: {
    "& span": { animation: "blink 1.4s infinite" },
  },
};
import json
import sqlite3
import httpx
import os
import pathlib

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
DB_PATH = str(pathlib.Path(__file__).parent / "meetingai.db")


class SmartMeetAgent:

    def __init__(self):
        self.db_path = DB_PATH
        self.history = []

    def _call_ollama(self, prompt: str, max_tokens: int = 500) -> str:
        try:
            r = httpx.post(
                OLLAMA_URL,
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": 0.1,
                        "num_ctx": 4096,
                    },
                },
                timeout=120.0,
            )
            r.raise_for_status()
            return r.json().get("response", "").strip()
        except Exception as e:
            return f"[Erreur Ollama : {e}]"

    def _generate_sql(self, question: str) -> str:
        prompt = f"""Tables SQLite disponibles :
- meetings (id, title, started_at, ended_at, status, num_speakers)
- transcripts (id, meeting_id, speaker, text, sentiment_label, sentiment_score)
- summaries (id, meeting_id, content, action_items, created_at)

Exemples :
Q: Combien de reunions ? -> SELECT COUNT(*) as total FROM meetings WHERE status='completed';
Q: Qui parle le plus ? -> SELECT speaker, COUNT(*) as nb FROM transcripts GROUP BY speaker ORDER BY nb DESC LIMIT 5;
Q: Sentiment dominant ? -> SELECT sentiment_label, COUNT(*) as nb FROM transcripts GROUP BY sentiment_label ORDER BY nb DESC;
Q: Derniere reunion ? -> SELECT title, started_at, num_speakers FROM meetings WHERE status='completed' ORDER BY started_at DESC LIMIT 1;
Q: Reunion la plus longue ? -> SELECT title, (julianday(ended_at)-julianday(started_at))*60*24 as minutes FROM meetings WHERE ended_at IS NOT NULL ORDER BY minutes DESC LIMIT 1;

Regles : reponds UNIQUEMENT avec le SQL valide SQLite, sans explication, LIMIT 10 max, pas de INSERT/UPDATE/DELETE/DROP.

Question : {question}
SQL:"""

        response = self._call_ollama(prompt, max_tokens=150)
        sql = response.strip().replace("```sql", "").replace("```", "").strip()

        forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE"]
        for word in forbidden:
            if word in sql.upper():
                return "SELECT 'Requete non autorisee' as message;"
        return sql

    def _execute_sql(self, sql: str) -> tuple[list[dict], str]:
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(sql)
            rows = cursor.fetchall()
            conn.close()
            if not rows:
                return [], "Aucun résultat trouvé."
            return [dict(row) for row in rows], None
        except sqlite3.Error as e:
            return [], f"Erreur SQL : {e}"

    def _format_response(self, question: str, sql: str, results: list[dict], sql_error: str) -> str:
        if sql_error:
            results_text = f"Erreur : {sql_error}"
        elif not results:
            results_text = "Aucune donnée trouvée."
        else:
            cleaned_results = []
            for r in results[:5]:
                clean = {}
                for k, v in r.items():
                    if k == "content" and v:
                        try:
                            data = json.loads(v)
                            clean["titre"] = data.get("titre") or data.get("title", "")
                            clean["resume"] = data.get("resume_executif") or data.get("executive_summary", "")
                            clean["decisions"] = data.get("decisions", [])
                            clean["points_cles"] = data.get("points_cles") or data.get("key_points", [])
                        except Exception:
                            clean[k] = v
                    else:
                        clean[k] = v
                cleaned_results.append(clean)
            results_text = json.dumps(cleaned_results, ensure_ascii=False, indent=2, default=str)

        prompt = f"""Tu es l'assistant SmartMeet. Reponds en francais, clairement et brievement.
Utilise uniquement les donnees fournies. Ne mentionne pas SQL ni la base de donnees.

Question : {question}
Donnees : {results_text}
Reponse :"""

        return self._call_ollama(prompt, max_tokens=400)

    def chat(self, question: str) -> dict:
        self.history.append({"role": "user", "content": question})
        sql = self._generate_sql(question)
        results, sql_error = self._execute_sql(sql)
        answer = self._format_response(question, sql, results, sql_error)
        self.history.append({"role": "assistant", "content": answer})
        return {
            "answer": answer,
            "sql": sql,
            "results_count": len(results),
            "debug": {
                "sql_generated": sql,
                "rows_returned": len(results),
                "error": sql_error,
            }
        }

    def reset(self):
        self.history = []


agent_instance = SmartMeetAgent()
import httpx, json, sqlite3, re, os

DB_PATH = "./meetingai.db"
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = "llama3.2:1b"

DB_SCHEMA = """
Tables disponibles :
- meetings(id, session_id, title, started_at, ended_at, status, num_speakers, language)
- transcripts(id, meeting_id, speaker, text, language, timestamp, sentiment_label)
- summaries(id, meeting_id, content, action_items, created_at)
"""

def ask_agent(question: str) -> str:
    # Étape 1 : Ollama génère le SQL
    sql = _generate_sql(question)
    if not sql:
        return "Je n'ai pas pu générer une requête pour cette question."

    # Étape 2 : Exécuter le SQL sur SQLite
    try:
        results = _execute_sql(sql)
    except Exception as e:
        return f"Erreur SQL : {e}"

    # Étape 3 : Ollama reformule la réponse en français
    return _format_response(question, results)


def _generate_sql(question: str) -> str:
    """Demande à Ollama de générer le SQL."""
    response = httpx.post(OLLAMA_URL, json={
        "model": MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": f"""Tu es un expert SQL. 
Tu génères UNIQUEMENT une requête SQL SELECT valide pour SQLite.
Pas d'explication, juste le SQL.
{DB_SCHEMA}"""},
            {"role": "user", "content": f"Question : {question}"}
        ],
        "options": {"temperature": 0.0, "num_predict": 200}
    }, timeout=60.0)

    raw = response.json()["message"]["content"].strip()
    # Extraire le SQL (enlever les balises markdown)
    raw = re.sub(r"```sql|```", "", raw).strip()
    # Sécurité : autoriser seulement SELECT
    if not raw.upper().startswith("SELECT"):
        return None
    return raw


def _execute_sql(sql: str) -> list:
    """Exécute la requête SQL sur SQLite."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(sql)
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def _format_response(question: str, results: list) -> str:
    """Demande à Ollama de formuler une réponse lisible."""
    if not results:
        return "Aucun résultat trouvé dans la base de données."

    response = httpx.post(OLLAMA_URL, json={
        "model": MODEL,
        "stream": False,
        "messages": [
            {"role": "system", "content": "Tu es un assistant. Réponds en français de manière concise et naturelle."},
            {"role": "user", "content": f"Question : {question}\nDonnées : {json.dumps(results[:10], ensure_ascii=False, default=str)}"}
        ],
        "options": {"temperature": 0.1, "num_predict": 300}
    }, timeout=60.0)

    return response.json()["message"]["content"].strip()
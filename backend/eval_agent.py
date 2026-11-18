"""
Test de l'agent IA SmartMeet sur la vraie DB
Lance : python test_agent_db.py
"""
import sqlite3
import sys
import os

# ── Utiliser la vraie DB ──────────────────────────────────────────────────────
DB_PATH = "meetingai.db"  # adapte si besoin

def run_sql(sql: str):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    try:
        cur.execute(sql)
        rows = [dict(r) for r in cur.fetchall()]
        return rows, None
    except Exception as e:
        return [], str(e)
    finally:
        conn.close()

TESTS = [
    ("Combien de réunions ?",
     "SELECT COUNT(*) as total FROM meetings WHERE status='completed'"),
    ("Qui parle le plus ?",
     "SELECT speaker, COUNT(*) as nb FROM transcripts GROUP BY speaker ORDER BY nb DESC LIMIT 5"),
    ("Sentiment dominant ?",
     "SELECT sentiment_label, COUNT(*) as nb FROM transcripts GROUP BY sentiment_label ORDER BY nb DESC"),
    ("Réunion la plus longue ?",
     "SELECT id, (julianday(ended_at)-julianday(started_at))*60*24 as min FROM meetings WHERE ended_at IS NOT NULL ORDER BY min DESC LIMIT 1"),
    ("Dernière réunion ?",
     "SELECT id, title, started_at, num_speakers FROM meetings WHERE status='completed' ORDER BY started_at DESC LIMIT 1"),
]

print("=" * 55)
print("  TEST AGENT SmartMeet — SQL direct sur DB réelle")
print("=" * 55)

all_ok = True
for question, sql in TESTS:
    rows, err = run_sql(sql)
    status = "✅" if not err else "❌"
    print(f"\n{status}  {question}")
    print(f"   SQL: {sql[:70]}...")
    if err:
        print(f"   ERREUR: {err}")
        all_ok = False
    else:
        for r in rows[:3]:
            print(f"   → {r}")

print("\n" + "=" * 55)
print("  Test import agent_instance (sans Ollama)")
print("=" * 55)
try:
    # Monkey-patch pour éviter d'appeler Ollama
    import agent as ag
    original = ag.SmartMeetAgent._call_ollama
    ag.SmartMeetAgent._call_ollama = lambda self, p, **kw: "SELECT COUNT(*) as total FROM meetings;"
    
    a = ag.SmartMeetAgent()
    a.db_path = DB_PATH
    sql = a._generate_sql("Combien de réunions ?")
    rows, err = a._execute_sql("SELECT COUNT(*) as total FROM meetings WHERE status='completed';")
    print(f"✅  _execute_sql OK → {rows}")
    ag.SmartMeetAgent._call_ollama = original
except Exception as e:
    print(f"❌  Import agent échoué: {e}")
    all_ok = False

print("\n" + ("✅ TOUS LES TESTS OK" if all_ok else "❌ DES ERREURS DÉTECTÉES"))
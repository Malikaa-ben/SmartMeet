# test_summarizer_latency.py
import time
import sys
sys.path.insert(0, ".")  # à exécuter depuis le dossier backend/

from summarizer import MeetingSummarizer

# Transcription de test représentative (basée sur vos vrais logs)
sample_transcript = [
    "Intervenant 1: Bonjour à tous, on commence la réunion.",
    "Intervenant 1: Aujourd'hui, je vais vous présenter un projet sur l'année.",
    "Intervenant 2: D'accord, intitulé comment exactement ?",
    "Intervenant 1: Un projet de transcription automatique de réunions.",
    "Intervenant 2: Très bien, et quel est le budget prévu ?",
    "Intervenant 1: On va devoir transporter ça vers la phase de test la semaine prochaine.",
]

summarizer = MeetingSummarizer()

print("Lancement de la génération du résumé...")
start = time.perf_counter()
result = summarizer.summarize(sample_transcript)
duration = time.perf_counter() - start

print(f"\n[RESULTAT] Temps de génération du résumé : {duration:.2f}s")
print(f"[RESULTAT] Résumé brut généré :\n{result}")
# test_memory_usage.py
import psutil
import os
import gc

process = psutil.Process(os.getpid())

def get_memory_mb():
    """Retourne la mémoire RSS (Resident Set Size) actuelle du processus, en Mo."""
    return process.memory_info().rss / (1024 * 1024)

print(f"[BASELINE] Mémoire avant chargement des modèles : {get_memory_mb():.1f} Mo\n")

# --- Test 1 : AudioProcessor + Silero VAD ---
from processor import AudioProcessor
mem_before = get_memory_mb()
audio_processor = AudioProcessor(sample_rate=16000)
mem_after = get_memory_mb()
print(f"[AudioProcessor / Silero VAD] +{mem_after - mem_before:.1f} Mo (total: {mem_after:.1f} Mo)")

# --- Test 2 : Whisper Tiny ---
from asr import ASREngine
mem_before = get_memory_mb()
asr_tiny = ASREngine(model_size="tiny", device="cpu")
mem_after = get_memory_mb()
print(f"[Whisper Tiny] +{mem_after - mem_before:.1f} Mo (total: {mem_after:.1f} Mo)")

# Libération avant de charger le modèle suivant, pour ne pas cumuler les deux Whisper en mémoire
del asr_tiny
gc.collect()
mem_after_cleanup = get_memory_mb()
print(f"[Après libération Whisper Tiny] {mem_after_cleanup:.1f} Mo\n")

# --- Test 3 : Whisper Small ---
mem_before = get_memory_mb()
asr_small = ASREngine(model_size="small", device="cpu")
mem_after = get_memory_mb()
print(f"[Whisper Small] +{mem_after - mem_before:.1f} Mo (total: {mem_after:.1f} Mo)")

del asr_small
gc.collect()
mem_after_cleanup = get_memory_mb()
print(f"[Après libération Whisper Small] {mem_after_cleanup:.1f} Mo\n")

# --- Test 4 : Diarizer (pyannote) ---
from diarizer import SpeakerDiarizer
mem_before = get_memory_mb()
diarizer = SpeakerDiarizer()
mem_after = get_memory_mb()
print(f"[SpeakerDiarizer] +{mem_after - mem_before:.1f} Mo (total: {mem_after:.1f} Mo)")

# --- Test 5 : SentimentAnalyzer ---
from sentiment import SentimentAnalyzer
mem_before = get_memory_mb()
sentiment_analyzer = SentimentAnalyzer()
mem_after = get_memory_mb()
print(f"[SentimentAnalyzer] +{mem_after - mem_before:.1f} Mo (total: {mem_after:.1f} Mo)")

print(f"\n[TOTAL FINAL] Mémoire du processus Python : {get_memory_mb():.1f} Mo")
# test_whisper_small_standalone.py
import time
import sys
sys.path.insert(0, ".")

from asr import ASREngine
import soundfile as sf
import librosa

# IMPORTANT : utilisez EXACTEMENT le même fichier que pour le test Tiny,
# pour une comparaison équitable entre les deux modèles
AUDIO_FILE_PATH = "chemin/vers/votre_fichier_test.wav"

print("Chargement de Whisper Small...")
asr_small = ASREngine(model_size="small", device="cpu")

print(f"Lecture du fichier : {AUDIO_FILE_PATH}")
audio_data, sr = sf.read(AUDIO_FILE_PATH, dtype="float32")
if audio_data.ndim > 1:
    audio_data = audio_data.mean(axis=1)
if sr != 16000:
    audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)

CHUNK_SIZE = 16000 * 4
STEP = CHUNK_SIZE // 2
durations = []

for start in range(0, len(audio_data), STEP):
    chunk = audio_data[start:start + CHUNK_SIZE]
    if len(chunk) < 16000:
        continue

    t0 = time.perf_counter()
    result = asr_small.transcribe(chunk)
    duration = time.perf_counter() - t0
    durations.append(duration)
    print(f"[{duration:.3f}s] '{result['text'][:60]}'")

if durations:
    print(f"\n=== RÉSULTATS Whisper Small ===")
    print(f"Min  : {min(durations):.3f}s")
    print(f"Max  : {max(durations):.3f}s")
    print(f"Moy  : {sum(durations)/len(durations):.3f}s")
    print(f"N    : {len(durations)} segments")
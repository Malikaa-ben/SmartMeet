"""
Audio Processing Module & FIX RMS FAIBLE
VAD_THRESHOLD très bas pour capturer même un micro faible
"""

import numpy as np
import torch
from typing import Optional


class AudioProcessor:
    VAD_THRESHOLD = 0.3  
    SAMPLE_RATE = 16000

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.vad_model, self.vad_utils = torch.hub.load(
            repo_or_dir="snakers4/silero-vad",
            model="silero_vad",
            force_reload=False,
            onnx=False,
            verbose=False,
        )
        self.vad_model.eval()
        print("Silero VAD loaded")

    def detect_speech(self, audio: np.ndarray) -> bool:
        """
        Détection de parole. Seuil très bas pour micro faible.
        Si RMS > 0.001 on force True même sans VAD.
        """
        audio = np.asarray(audio, dtype=np.float32)

        rms = float(np.sqrt(np.mean(audio ** 2)))
        if rms > 0.02:
            return True

        window_size = 512
        for start in range(0, len(audio) - window_size + 1, window_size):
            window = audio[start:start + window_size]
            tensor = torch.from_numpy(window).unsqueeze(0)
            with torch.no_grad():
                prob = self.vad_model(tensor, self.sample_rate).item()
            if prob > self.VAD_THRESHOLD:
                return True
        return False

    def normalize(self, audio: np.ndarray) -> np.ndarray:
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            return audio / max_val
        return audio
    
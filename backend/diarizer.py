import os
import numpy as np
import torch
from dotenv import load_dotenv

load_dotenv()

class SpeakerDiarizer:
    def __init__(self):
        self.speaker_embeddings = {}
        self.speaker_counter = 0
        self.embedding_model = None
        self.threshold = 0.35
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._load_model()

    def _load_model(self):
        hf_token = os.getenv("HF_TOKEN")
        if not hf_token:
            print("HF_TOKEN manquant. Mode heuristique activé.")
            return

        try:
            from pyannote.audio import Model
            self.embedding_model = Model.from_pretrained(
                "pyannote/wespeaker-voxceleb-resnet34-LM",
                use_auth_token=hf_token
            )
            self.embedding_model.to(self.device)
            print(f"Diarisation active sur {self.device}")
        except Exception as e:
            print(f" Erreur Pyannote : {e}")
            self.embedding_model = None

    def _get_embedding(self, audio: np.ndarray) -> np.ndarray:
        if self.embedding_model is None:
            return self._heuristic_embedding(audio)

        try:
            audio_tensor = torch.from_numpy(audio).float().to(self.device)
            if audio_tensor.ndim == 1:
                audio_tensor = audio_tensor.unsqueeze(0).unsqueeze(0)
            
            with torch.no_grad():
                embedding = self.embedding_model(audio_tensor)
                emb_np = embedding.squeeze().cpu().numpy()
                return emb_np / (np.linalg.norm(emb_np) + 1e-8)
        except:
            return self._heuristic_embedding(audio)

    def _heuristic_embedding(self, audio: np.ndarray) -> np.ndarray:
        fft = np.abs(np.fft.rfft(audio, n=1024))
        return fft / (np.linalg.norm(fft) + 1e-8)

    def identify_speaker(self, audio_chunk: np.ndarray) -> str:

        if np.max(np.abs(audio_chunk)) < 0.01:
            return "Silence"

        emb = self._get_embedding(audio_chunk)
        best_sid = None
        max_score = -1.0

        for sid, known_emb in self.speaker_embeddings.items():
            score = float(np.dot(emb, known_emb))
            if score > max_score:
                max_score = score
                best_sid = sid

        if best_sid and max_score >= self.threshold:
            self.speaker_embeddings[best_sid] = 0.8 * self.speaker_embeddings[best_sid] + 0.2 * emb
            self.speaker_embeddings[best_sid] /= np.linalg.norm(self.speaker_embeddings[best_sid])
            return best_sid


        self.speaker_counter += 1
        new_sid = f"Intervenant {self.speaker_counter}"
        self.speaker_embeddings[new_sid] = emb
        print(f"Nouveau locuteur : {new_sid} (Score max était {max_score:.2f})")
        return new_sid

    def reset(self):
        self.speaker_embeddings = {}
        self.speaker_counter = 0
"""
ASR Engine - faster-whisper (CTranslate2, 2-4x plus rapide que openai-whisper sur CPU)
Optimisé pour éviter les hallucinations et les erreurs de langue.
"""
import numpy as np
from faster_whisper import WhisperModel
from typing import Optional


class ASREngine:
    
    SUPPORTED_LANGS = {"fr", "en", "ar"}
    
    
    LANG_ALIASES = {
        "ar-MA": "ar",
        "darija": "ar",
        "arabic": "ar",
        "french": "fr",
        "english": "en",
    }

    def __init__(self, model_size: str = "small", device: str = "cpu"):
        print(f"Initialisation de Whisper {model_size} sur {device}...")
        
        self.model = WhisperModel(
            model_size, 
            device=device,
            compute_type="int8" # Indispensable pour la vitesse sur CPU
        )

        self.device = device
        self._detected_lang: Optional[str] = None
        print(f" Whisper {model_size} prêt.")

    def transcribe(self, audio: np.ndarray, language: Optional[str] = None) -> dict:
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        forced_lang = self.LANG_ALIASES.get(language.lower(), language.lower()) if language else (self._detected_lang or "fr")

        # --- MODIFICATIONS ICI ---
        segments_gen, info = self.model.transcribe(
            audio,
            language=forced_lang,
            task="transcribe",
            beam_size=5,            
            temperature=0.0,        
            vad_filter=True,        
            vad_parameters=dict(min_silence_duration_ms=1000, speech_pad_ms=200),

            condition_on_previous_text=False, 
            no_speech_threshold=0.6,          
        )


        segments = list(segments_gen)
        text = " ".join(s.text for s in segments).strip()


        # Whisper invente ces phrases quand il y a du bruit ou du silence
        HALLUCINATIONS = [
            "thank you for watching", 
            "i don't know", 
            "je ne sais pas",
            "sous-titres réalisés", 
            "amara.org",
            "merci d'avoir regardé",
            "geli", "amai", "watani" 
        ]
        
        text_lower = text.lower()
        
        # Si le texte contient une hallucination ou est trop court, on l'efface
        for h in HALLUCINATIONS:
            if h in text_lower:
                print(f"   Hallucination détectée et bloquée : '{text}'")
                return {"text": "", "language": info.language, "segments": [], "confidence": 0.0}

        if len(text) < 3: # Si c'est juste un bruit ou un point
            return {"text": "", "language": info.language, "segments": [], "confidence": 0.0}

        # Calcul de la confiance
        confidence = 0.0
        if segments:
            avg_logprob = sum(s.avg_logprob for s in segments) / len(segments)
            confidence = round(float(np.exp(avg_logprob)), 3)

        return {
            "text": text,
            "language": info.language,
            "segments": [{"start": s.start, "end": s.end, "text": s.text} for s in segments],
            "confidence": confidence,
        }

    def _detect_and_cache(self, audio: np.ndarray) -> Optional[str]:
        """Détecte la langue une seule fois au début."""
        try:
            # On écoute un petit morceau pour deviner la langue
            _, info = self.model.transcribe(audio, beam_size=1)
            lang = info.language
            # On n'accepte que nos langues cibles, sinon on force 'fr'
            if lang not in self.SUPPORTED_LANGS:
                lang = "fr"
            self._detected_lang = lang
            return lang
        except:
            return "fr"

    def reset_language_cache(self):
        self._detected_lang = None
        print("  Cache langue réinitialisé")
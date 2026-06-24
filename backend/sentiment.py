

from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch


class SentimentAnalyzer:
    """
    Analyse de sentiment via modele transformer multilingue pre-entraine.
    Aucune heuristique ni mots-cles — 100% modele ML.

    Modele : tabularisai/multilingual-sentiment-analysis
    Labels : Very Negative / Negative / Neutral / Positive / Very Positive
    """

    MODEL_NAME = "tabularisai/multilingual-sentiment-analysis"

    # Mapping labels du modele -> format interne
    LABEL_MAP = {
        "Very Negative": "negative",
        "Negative":      "negative",
        "Neutral":       "neutral",
        "Positive":      "positive",
        "Very Positive": "positive",
    }

    # Score ajuste selon l'intensite
    SCORE_MAP = {
        "Very Negative": 0.95,
        "Negative":      0.75,
        "Neutral":       0.60,
        "Positive":      0.75,
        "Very Positive": 0.95,
    }

    EMOJI_MAP = {
        "positive": "😊",
        "neutral":  "😐",
        "negative": "😟",
    }

    COLOR_MAP = {
        "positive": "#22c55e",
        "neutral":  "#94a3b8",
        "negative": "#ef4444",
    }

    LABEL_FR = {
        "positive": "positif",
        "neutral":  "neutre",
        "negative": "negatif",
    }

    def __init__(self):
        print(f"Chargement du modele de sentiment : {self.MODEL_NAME} ...")
        try:
            self._tokenizer = AutoTokenizer.from_pretrained(self.MODEL_NAME)
            self._model     = AutoModelForSequenceClassification.from_pretrained(
                self.MODEL_NAME
            )
            self._model.eval()

            # Pipeline haut niveau pour inference simple
            self._pipe = pipeline(
                task="text-classification",
                model=self._model,
                tokenizer=self._tokenizer,
                max_length=512,
                truncation=True,
                device=0 if torch.cuda.is_available() else -1,
            )

            # Recuperer les labels depuis la config du modele
            self._id2label = self._model.config.id2label
            print(f"Modele charge. Labels : {list(self._id2label.values())}")
            print(f"Device : {'GPU' if torch.cuda.is_available() else 'CPU'}")
            print(f"Sentiment pret.")

        except Exception as e:
            raise RuntimeError(
                f"Impossible de charger le modele de sentiment '{self.MODEL_NAME}'.\n"
                f"Verifiez votre connexion internet et installez : "
                f"pip install transformers torch\n"
                f"Erreur : {e}"
            )

    def analyze(self, text: str) -> dict:
        """
        Analyse le sentiment d'un texte via le modele pre-entraine.

        Args:
            text : texte a analyser (francais, anglais, arabe, ...)

        Returns:
            dict avec label, label_fr, score, emoji, color
        """
        if not text or len(text.strip()) < 2:
            return self._build_result("Neutral", 0.6)

        try:
            # Truncation a 512 tokens
            out        = self._pipe(text[:1024], top_k=1)[0]
            raw_label  = out["label"]    # ex: "Positive", "Very Negative"
            confidence = round(float(out["score"]), 3)

            # Utiliser le score du modele (confiance) ou le score ajuste
            final_score = max(confidence, self.SCORE_MAP.get(raw_label, 0.6))

            return self._build_result(raw_label, final_score)

        except Exception as e:
            print(f"Erreur inference sentiment : {e}")
            # Retourner neutre en cas d'erreur technique (pas de fallback heuristique)
            return self._build_result("Neutral", 0.5)

    def _build_result(self, raw_label: str, score: float) -> dict:
        """Construit le dictionnaire de resultat normalise."""
        label = self.LABEL_MAP.get(raw_label, "neutral")
        return {
            "label":     label,
            "label_fr":  self.LABEL_FR[label],
            "label_raw": raw_label,   # label original du modele (ex: "Very Positive")
            "score":     round(score, 3),
            "emoji":     self.EMOJI_MAP[label],
            "color":     self.COLOR_MAP[label],
        }

    def analyze_batch(self, texts: list) -> list:
        """
        Analyse une liste de textes en batch (plus efficace).

        Args:
            texts : liste de chaines de caracteres

        Returns:
            liste de dictionnaires de resultats
        """
        if not texts:
            return []

        try:
            # Traitement batch natif du pipeline
            valid  = [t[:1024] if t and len(t.strip()) >= 2 else "." for t in texts]
            outs   = self._pipe(valid, top_k=1, batch_size=8)
            return [
                self._build_result(o[0]["label"], max(float(o[0]["score"]), self.SCORE_MAP.get(o[0]["label"], 0.6)))
                for o in outs
            ]
        except Exception as e:
            print(f"Erreur batch sentiment : {e}")
            return [self._build_result("Neutral", 0.5) for _ in texts]

    def aggregate_session_sentiment(self, sentiments: list) -> dict:
        """
        Calcule le sentiment dominant sur toute une session.

        Args:
            sentiments : liste de resultats de analyze()

        Returns:
            dict avec dominant, distribution, emoji, color
        """
        if not sentiments:
            return {
                "dominant":     "neutral",
                "dominant_fr":  "neutre",
                "distribution": {"positive": 0.0, "neutral": 1.0, "negative": 0.0},
                "emoji":        "😐",
                "color":        "#94a3b8",
            }

        counts = {"positive": 0, "neutral": 0, "negative": 0}
        for s in sentiments:
            label = s.get("label", "neutral")
            if label in counts:
                counts[label] += 1

        total    = len(sentiments)
        dist     = {k: round(v / total, 2) for k, v in counts.items()}
        dominant = max(counts, key=counts.get)

        return {
            "dominant":     dominant,
            "dominant_fr":  self.LABEL_FR[dominant],
            "distribution": dist,
            "emoji":        self.EMOJI_MAP[dominant],
            "color":        self.COLOR_MAP[dominant],
            "total_segments": total,
        }
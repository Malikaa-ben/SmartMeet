

import re


class SentimentAnalyzer:
    """
    Analyse de sentiment multilingue par mots-clés.
    Fonctionne en français, anglais et arabe.
    Aucun modèle à télécharger — 0 MB RAM.
    """


    POSITIVE_WORDS = {
        # Français
        "bien", "super", "excellent", "parfait", "bravo", "merci", "accord",
        "validé", "approuvé", "ok", "oui", "bonne", "bon", "génial",
        "efficace", "réussi", "succès", "progrès", "avancer", "résolu",
        "contenu", "satisfait", "positif", "top", "idéal", "favorable",
        # English
        "good", "great", "excellent", "perfect", "yes", "agree", "approved",
        "success", "done", "nice", "awesome", "thanks", "correct", "right",
        # Arabe
        "جيد", "ممتاز", "نعم", "موافق", "شكرا", "رائع",
    }


    NEGATIVE_WORDS = {
        # Français
        "non", "problème", "erreur", "mauvais", "difficile", "impossible",
        "refus", "refusé", "bloqué", "retard", "échec", "raté", "bug",
        "urgent", "critique", "grave", "risque", "peur", "inquiet",
        "cher", "coût", "budget", "dépassé", "annulé", "rejeté",
        # English
        "no", "bad", "error", "problem", "fail", "wrong", "issue",
        "blocked", "delay", "reject", "cancel", "risk", "bug", "crash",
        # Arabe
        "لا", "مشكلة", "خطأ", "سيء", "صعب",
    }

    EMOJI_MAP = {"positif": "😊", "neutre": "😐", "négatif": "😟"}
    COLOR_MAP = {"positif": "#22c55e", "neutre": "#94a3b8", "négatif": "#ef4444"}
    LABEL_EN = {"positif": "positive", "neutre": "neutral", "négatif": "negative"}

    def __init__(self):
        print("SentimentAnalyzer chargé (mode mots-clés, 0 MB RAM, gratuit)")

    def analyze(self, text: str) -> dict:
        """
        Analyse le sentiment d'un texte par mots-clés.
        Retourne : { label, score, emoji, color }
        """
        if not text or len(text.strip()) < 2:
            return self._result("neutre", 0.5)

        words = re.findall(r"\b\w+\b", text.lower())
        pos = sum(1 for w in words if w in self.POSITIVE_WORDS)
        neg = sum(1 for w in words if w in self.NEGATIVE_WORDS)
        total = len(words) or 1

        if pos == 0 and neg == 0:
            return self._result("neutre", 0.6)

        if pos > neg:
            score = min(0.95, 0.6 + pos / total)
            return self._result("positif", round(score, 3))
        elif neg > pos:
            score = min(0.95, 0.6 + neg / total)
            return self._result("négatif", round(score, 3))
        else:
            return self._result("neutre", 0.55)

    def _result(self, label: str, score: float) -> dict:
        return {
            "label": self.LABEL_EN[label],  
            "label_fr": label,
            "score": score,
            "emoji": self.EMOJI_MAP[label],
            "color": self.COLOR_MAP[label],
        }

    def analyze_batch(self, texts: list) -> list:
        return [self.analyze(t) for t in texts]

    def aggregate_session_sentiment(self, sentiments: list) -> dict:
        if not sentiments:
            return {"dominant": "neutral", "distribution": {}}
        counts = {"positive": 0, "neutral": 0, "negative": 0}
        for s in sentiments:
            counts[s.get("label", "neutral")] = counts.get(s.get("label", "neutral"), 0) + 1
        total = len(sentiments)
        distribution = {k: round(v / total, 2) for k, v in counts.items()}
        dominant = max(counts, key=counts.get)
        label_fr = {"positive": "positif", "neutral": "neutre", "negative": "négatif"}[dominant]
        return {
            "dominant": dominant,
            "distribution": distribution,
            "emoji": self.EMOJI_MAP[label_fr],
            "color": self.COLOR_MAP[label_fr],
        }
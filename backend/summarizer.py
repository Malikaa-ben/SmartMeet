"""
Summarizer - Ollama /api/chat
Optimisé pour llama3.2:3b
"""
import json, re, httpx, gc, os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent / ".env")


class MeetingSummarizer:
    def __init__(self, model: str = None, ollama_base: str = None):
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.2:3b")
        base       = ollama_base or os.getenv("OLLAMA_BASE", "http://localhost:11434")
        self.chat_url = f"{base}/api/chat"
        self.tags_url = f"{base}/api/tags"
        print(f" MeetingSummarizer → '{self.model}' @ {self.chat_url}")



    def is_ollama_available(self) -> bool:
        try:
            r = httpx.get(self.tags_url, timeout=3.0)
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
            ok = any(self.model in m for m in models)
            if not ok:
                print(f"   Modèle '{self.model}' absent. Disponibles : {models}")
            return ok
        except Exception as e:
            print(f"  Ollama non disponible : {e}")
            return False



    def _call_ollama(self, system: str, user: str, max_tokens: int = 600) -> str:
        print(f"  → Ollama /api/chat ({self.model})...", flush=True)
        gc.collect()
        try:
            r = httpx.post(self.chat_url, json={
                "model":  self.model,
                "stream": False,
                "format": "json",
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                "options": {
                    "num_predict": max_tokens,
                    "temperature": 0.1,
                    "num_ctx":     2048,
                    "num_thread":  4,
                    "num_gpu":     0,
                },
            }, timeout=180.0)
            r.raise_for_status()
            content = r.json().get("message", {}).get("content", "").strip()
            print(f"  → {len(content)} chars : {content[:150]}", flush=True)
            return content
        except httpx.ConnectError:
            print("   Ollama non joignable — lancez : ollama serve", flush=True)
            return ""
        except httpx.HTTPStatusError as e:
            print(f"   HTTP {e.response.status_code}: {e.response.text[:200]}", flush=True)
            return ""
        except Exception as e:
            print(f"   Erreur : {e}", flush=True)
            return ""



    def _extract_only_text(self, segments: list) -> str:
        return " ".join(
            s.get("text", "").strip()
            for s in segments if s.get("text", "").strip()
        )

    def _get_participants(self, segments: list) -> list:
        return sorted(set(s.get("speaker", "?") for s in segments if s.get("speaker")))

    def _parse_json(self, text: str) -> dict | list | None:
        if not text:
            return None
        text = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
        try:
            return json.loads(text)
        except Exception:
            pass
        for s_char, e_char in [("{", "}"), ("[", "]")]:
            s = text.find(s_char)
            e = text.rfind(e_char) + 1
            if s != -1 and e > s:
                try:
                    return json.loads(text[s:e])
                except Exception:
                    pass
        return None

    def _fallback_summary(self, segments: list, date_str: str, participants: list) -> str:
        print(" Ollama KO → fallback extrait de la transcription", flush=True)
        pure_text = self._extract_only_text(segments)
        sentences = [s.strip() for s in re.split(r"[.!?]", pure_text) if len(s.strip()) > 20]
        return json.dumps({
            "titre":           f"Réunion du {date_str}",
            "resume_executif": ". ".join(sentences[:3]) + "." if sentences else "Résumé indisponible.",
            "points_cles":     sentences[3:7],
            "decisions":       [],
            "ambiance":        "Neutre",
            "date":            date_str,
            "participants":    participants,
            "note":            "Ollama indisponible. Lancez : ollama serve && ollama pull llama3.2:3b",
        }, ensure_ascii=False, indent=2)


    def summarize(self, transcript_data) -> str:
        if not transcript_data:
            return json.dumps({"error": "Transcription vide"}, ensure_ascii=False)

        if isinstance(transcript_data, list) and transcript_data and isinstance(transcript_data[0], dict):
            pure_text    = self._extract_only_text(transcript_data)
            participants = self._get_participants(transcript_data)
        else:
            pure_text    = str(transcript_data)
            participants = []

        date_str = datetime.now().strftime("%Y-%m-%d")
        print(f"\n[RÉSUMÉ] {len(pure_text)} chars | participants: {participants}", flush=True)

        system = (
            "Tu es un assistant secrétaire de réunion professionnel. "
            "Tu réponds UNIQUEMENT en JSON valide, sans texte autour ni markdown. "
            "Remplace chaque '...' par le vrai contenu extrait de la transcription. "
            "Ne mentionne pas les noms des intervenants dans le résumé narratif."
        )

        user = f"""Génère le compte-rendu de cette réunion en JSON strict.
Remplace chaque valeur par le vrai contenu extrait de la transcription ci-dessous.

{{
  "titre": "...",
  "resume_executif": "...",
  "points_cles": ["...", "...", "..."],
  "decisions": ["..."],
  "ambiance": "productive | collaborative | neutre | tendue"
}}

Transcription :
{pure_text[:1500]}"""

        raw    = self._call_ollama(system, user, max_tokens=600)
        parsed = self._parse_json(raw)

        if isinstance(parsed, dict):
            titre = parsed.get("titre", "")
            is_placeholder = any(p in titre.lower() for p in ["...", "titre", "sujet"])
            resume = parsed.get("resume_executif", "").strip()

            if not is_placeholder and resume and resume != "...":
                result = {
                    "titre":           titre or f"Réunion du {date_str}",
                    "resume_executif": resume,
                    "points_cles":     [p for p in (parsed.get("points_cles") or []) if p != "..."],
                    "decisions":       [d for d in (parsed.get("decisions") or []) if d != "..."],
                    "ambiance":        parsed.get("ambiance") or "Neutre",
                    "date":            date_str,
                    "participants":    participants,
                }
                print("Résumé OK", flush=True)
                return json.dumps(result, ensure_ascii=False, indent=2)
            else:
                print("Placeholders détectés → fallback", flush=True)

        return self._fallback_summary(
            transcript_data if isinstance(transcript_data, list) else [],
            date_str, participants
        )

    def extract_action_items(self, transcript_data) -> list:
        if not transcript_data:
            return []

        pure_text = (
            self._extract_only_text(transcript_data)
            if isinstance(transcript_data, list) and transcript_data and isinstance(transcript_data[0], dict)
            else str(transcript_data)
        )

        if len(pure_text.strip()) < 30:
            return []

        system = (
            "Tu es un assistant. Réponds UNIQUEMENT avec un tableau JSON valide. "
            "Si aucune action n'est mentionnée, retourne []."
        )

        user = f"""Extrais les actions à faire depuis cette transcription de réunion.
Remplace chaque '...' par le vrai contenu.

[{{"responsable": "...", "tache": "...", "deadline": null}}]

Si aucune action explicite, retourne [].

Transcription :
{pure_text[:1000]}"""

        raw = self._call_ollama(system, user, max_tokens=300)
        if raw:
            parsed = self._parse_json(raw)
            if isinstance(parsed, list):
                valid = [
                    {
                        "responsable": item.get("responsable", "?"),
                        "tache":       item.get("tache", ""),
                        "deadline":    item.get("deadline"),
                    }
                    for item in parsed
                    if isinstance(item, dict) and item.get("tache") and item.get("tache") != "..."
                ]
                print(f"   {len(valid)} action(s) extraite(s)", flush=True)
                return valid

        print("  Aucune action extraite", flush=True)
        return []

    def generate_meeting_minutes(self, summary_json: str) -> str:
        try:
            data = json.loads(summary_json)
        except Exception:
            return summary_json

        lines = [
            f"# {data.get('titre', 'Compte-Rendu')}",
            f"**Date :** {data.get('date', 'N/A')}",
            f"**Participants :** {', '.join(data.get('participants', []))}",
            "",
            "## Résumé Exécutif",
            data.get("resume_executif", ""),
            "",
            "## Points Clés",
            *[f"- {p}" for p in data.get("points_cles", [])],
            "",
            "## Décisions",
            *[f"- {d}" for d in data.get("decisions", [])],
            "",
            "## Ambiance",
            data.get("ambiance", ""),
        ]

        if data.get("note"):
            lines += ["", f">  {data['note']}"]

        return "\n".join(lines)
"""
REST API Routes
Provides endpoints for meeting management, history, and summary retrieval.
"""

import json
import tempfile
import os
import numpy as np
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db, Meeting, Transcript, Summary

router = APIRouter()



class MeetingCreate(BaseModel):
    title: str | None = None


class MeetingResponse(BaseModel):
    id: int
    session_id: str
    title: str | None
    started_at: datetime
    ended_at: datetime | None
    status: str
    duration_seconds: int | None
    num_speakers: int

    class Config:
        from_attributes = True


class TranscriptSegment(BaseModel):
    speaker: str
    text: str
    language: str
    timestamp: datetime
    sentiment_label: str
    sentiment_score: float



def _normalize_content(raw_data: dict) -> dict:
    return {
        "title":             raw_data.get("titre")           or raw_data.get("title")             or "Compte-rendu",
        "executive_summary": raw_data.get("resume_executif") or raw_data.get("executive_summary") or raw_data.get("resume") or "",
        "key_points":        raw_data.get("points_cles")     or raw_data.get("key_points")        or [],
        "decisions":         raw_data.get("decisions")       or [],
        "ambiance":          raw_data.get("ambiance")        or "Neutre",
        "participants":      raw_data.get("participants")    or [],
    }


@router.get("/meetings", response_model=list[MeetingResponse])
def list_meetings(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    meetings = (
        db.query(Meeting)
        .order_by(Meeting.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [
        MeetingResponse(
            id=m.id, session_id=m.session_id, title=m.title,
            started_at=m.started_at, ended_at=m.ended_at,
            status=m.status, duration_seconds=m.duration_seconds,
            num_speakers=m.num_speakers,
        )
        for m in meetings
    ]


@router.get("/meetings/{session_id}", response_model=MeetingResponse)
def get_meeting(session_id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return MeetingResponse(
        id=meeting.id, session_id=meeting.session_id, title=meeting.title,
        started_at=meeting.started_at, ended_at=meeting.ended_at,
        status=meeting.status, duration_seconds=meeting.duration_seconds,
        num_speakers=meeting.num_speakers,
    )


@router.get("/meetings/{session_id}/transcript", response_model=list[TranscriptSegment])
def get_transcript(session_id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting.transcripts


@router.get("/meetings/{session_id}/summary")
def get_summary(session_id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not meeting.summaries:
        raise HTTPException(status_code=404, detail="Résumé non encore généré.")

    summary = meeting.summaries[-1]
    try:
        raw_data = json.loads(summary.content)
        content  = _normalize_content(raw_data)
        if not content["executive_summary"] and isinstance(raw_data, dict):
            vals = [str(v) for v in raw_data.values() if v and isinstance(v, str)]
            content["executive_summary"] = vals[0] if vals else "Résumé indisponible."
    except Exception:
        content = {
            "title": "Résumé de réunion", "executive_summary": summary.content,
            "key_points": [], "decisions": [], "ambiance": "N/A", "participants": [],
        }

    try:
        action_items = json.loads(summary.action_items)
        if not isinstance(action_items, list):
            action_items = []
    except Exception:
        action_items = []

    return {
        "meeting_id": meeting.id, "content": content,
        "action_items": action_items, "created_at": summary.created_at,
    }


@router.post("/meetings/{session_id}/regenerate-summary")
def regenerate_summary(session_id: str, db: Session = Depends(get_db)):
    from summarizer import MeetingSummarizer

    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if not meeting.transcripts:
        raise HTTPException(status_code=400, detail="Aucune transcription disponible.")

    segments = [
        {"speaker": t.speaker, "text": t.text}
        for t in meeting.transcripts if t.text and t.text.strip()
    ]
    if not segments:
        raise HTTPException(status_code=400, detail="Transcriptions vides.")

    summarizer       = MeetingSummarizer()
    new_summary_text = summarizer.summarize(segments)

    for old in meeting.summaries:
        db.delete(old)
    db.flush()

    db.add(Summary(
        meeting_id=meeting.id, content=new_summary_text,
        action_items=json.dumps([]), created_at=datetime.utcnow(),
    ))
    db.commit()

    try:
        preview = json.loads(new_summary_text).get("resume_executif", "")[:200]
    except Exception:
        preview = new_summary_text[:200]

    return {"message": "Résumé régénéré avec succès.", "session_id": session_id, "preview": preview}

@router.post("/agent/ask")
async def agent_ask(body: dict):
    from agent import agent_instance   
    question = body.get("question", "").strip()
    if not question:
        raise HTTPException(400, "Question vide")
    result = agent_instance.chat(question)
    return {
        "question": question,
        "answer": result["answer"],
        "debug": result.get("debug") 
    }
@router.post("/meetings/cleanup-orphans")
def cleanup_orphans(db: Session = Depends(get_db)):
    """Ferme les réunions actives sans transcriptions (sessions abandonnées)."""
    from sqlalchemy import and_
    orphans = (
        db.query(Meeting)
        .filter(Meeting.status == "active")
        .filter(~Meeting.transcripts.any())
        .all()
    )
    count = len(orphans)
    for m in orphans:
        m.status = "completed"
        m.ended_at = datetime.utcnow()
    db.commit()
    return {"cleaned": count}


@router.delete("/meetings/{session_id}")
def delete_meeting(session_id: str, db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    db.delete(meeting)
    db.commit()
    return {"message": "Meeting deleted successfully"}


@router.get("/meetings/{session_id}/export")
def export_meeting(session_id: str, fmt: str = "markdown", db: Session = Depends(get_db)):
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if fmt == "json":
        return {
            "meeting":    {"session_id": meeting.session_id, "started_at": meeting.started_at.isoformat(), "status": meeting.status},
            "transcript": [{"speaker": t.speaker, "text": t.text, "timestamp": t.timestamp.isoformat()} for t in meeting.transcripts],
            "summary":    _normalize_content(json.loads(meeting.summaries[-1].content)) if meeting.summaries else None,
        }

    data  = _normalize_content(json.loads(meeting.summaries[-1].content)) if meeting.summaries else {}
    lines = [
        f"# {data.get('title','Réunion')} — {meeting.started_at.strftime('%d/%m/%Y')}",
        "", "## Résumé exécutif", data.get("executive_summary",""),
        "", "## Points Clés", *[f"- {pt}" for pt in data.get("key_points",[])],
        "", "## Décisions",   *[f"- {d}"  for d  in data.get("decisions",[])],
        "", "## Transcription Complète", "",
        *[f"**{t.speaker}** : {t.text}" for t in meeting.transcripts],
    ]
    return {"content": "\n".join(lines), "format": "markdown"}



@router.post("/transcribe-file")
async def transcribe_file(file: UploadFile = File(...)):
    """
    Transcrit un fichier audio/vidéo et génère un résumé avec points clés.
    Formats : MP3, WAV, MP4, M4A, OGG, WEBM, MOV, FLAC
    """
    from asr import ASREngine
    from diarizer import SpeakerDiarizer
    from summarizer import MeetingSummarizer

    ext = os.path.splitext(file.filename or "")[-1].lower()
    allowed_exts = {".mp3", ".wav", ".mp4", ".m4a", ".ogg", ".webm", ".mov", ".flac"}

    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté : '{ext}'. Formats acceptés : {', '.join(allowed_exts)}"
        )


    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        audio = None
        sr    = 16000


        try:
            import soundfile as sf
            audio, sr = sf.read(tmp_path, dtype="float32", always_2d=False)
            if audio.ndim > 1:
                audio = audio.mean(axis=1)
        except Exception:
            pass

        if audio is None:
            try:
                import librosa
                audio, sr = librosa.load(tmp_path, sr=16000, mono=True)
            except Exception as e:
                raise HTTPException(
                    status_code=422,
                    detail=f"Impossible de lire '{file.filename}'. ffmpeg requis. Erreur : {e}"
                )

        if sr != 16000:
            import librosa
            audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
        audio = audio.astype(np.float32)


        asr = ASREngine(model_size="tiny", device="cpu")  
        result = asr.transcribe(audio)

        if not result["text"].strip():
            return {
                "text": "", "language": result.get("language", "unknown"),
                "segments": [], "summary": None,
                "filename": file.filename,
                "duration": round(len(audio) / 16000, 1),
                "message": "Aucune parole détectée dans le fichier.",
            }

        diarizer     = SpeakerDiarizer()
        segments_out = []

        for seg in result.get("segments", []):
            start_i = int(seg.get("start", 0) * 16000)
            end_i   = min(int(seg.get("end", 0) * 16000), len(audio))
            chunk   = audio[start_i:end_i] if end_i > start_i else audio[:16000]
            try:
                speaker = diarizer.identify_speaker(chunk)
            except Exception:
                speaker = "Intervenant 1"

            text = seg.get("text", "").strip()
            if text:
                segments_out.append({
                    "speaker":  speaker,
                    "text":     text,
                    "start":    round(seg.get("start", 0), 2),
                    "end":      round(seg.get("end",   0), 2),
                    "language": result.get("language", "fr"),
                })

        if not segments_out:
            segments_out = [{
                "speaker": "Intervenant 1", "text": result["text"],
                "start": 0.0, "end": round(len(audio) / 16000, 1),
                "language": result.get("language", "fr"),
            }]


        summary_data = None
        try:
            summarizer   = MeetingSummarizer()
            summary_json = summarizer.summarize(segments_out)
            raw          = json.loads(summary_json)

            summary_data = {
                "title":             raw.get("titre")           or raw.get("title")             or file.filename,
                "executive_summary": raw.get("resume_executif") or raw.get("executive_summary") or "",
                "key_points":        raw.get("points_cles")     or raw.get("key_points")        or [],
                "decisions":         raw.get("decisions")       or [],
                "ambiance":          raw.get("ambiance")        or "Neutre",
                "participants":      raw.get("participants")    or list({s["speaker"] for s in segments_out}),
            }
        except Exception as e:

            sentences = result["text"].split(". ")
            summary_data = {
                "title":             file.filename,
                "executive_summary": ". ".join(sentences[:4]) + "." if sentences else result["text"][:300],
                "key_points":        [s.strip() for s in sentences[4:10] if len(s.strip()) > 20],
                "decisions":         [],
                "ambiance":          "Neutre",
                "participants":      list({s["speaker"] for s in segments_out}),
                "note":              f"Ollama indisponible : {e}",
            }

        return {
            "text":      result["text"],
            "language":  result.get("language", "unknown"),
            "segments":  segments_out,
            "summary":   summary_data,
            "filename":  file.filename,
            "duration":  round(len(audio) / 16000, 1),
        }

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
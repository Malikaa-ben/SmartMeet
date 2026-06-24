
import asyncio
import json
import logging
import os
import uuid
import tempfile
from datetime import datetime
from typing import Optional

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from processor import AudioProcessor
from asr import ASREngine
from sentiment import SentimentAnalyzer
from summarizer import MeetingSummarizer
from diarizer import SpeakerDiarizer
from models import get_db, SessionLocal, Meeting, Transcript, Summary, create_tables
from routes import router as api_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import time
import functools

logger_latency = logging.getLogger("smartmeet.latency")

def measure_latency(step_name: str):
    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = await func(*args, **kwargs)
            logger_latency.info(f"[LATENCY] {step_name}: {time.perf_counter() - start:.3f}s")
            return result

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start = time.perf_counter()
            result = func(*args, **kwargs)
            logger_latency.info(f"[LATENCY] {step_name}: {time.perf_counter() - start:.3f}s")
            return result

        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    return decorator

app = FastAPI(title="SmartMeet API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

active_sessions: dict[str, WebSocket] = {}
audio_processor: Optional[AudioProcessor] = None
asr_engine: Optional[ASREngine] = None
sentiment_analyzer: Optional[SentimentAnalyzer] = None
summarizer: Optional[MeetingSummarizer] = None
diarizer: Optional[SpeakerDiarizer] = None


@app.on_event("startup")
async def startup_event():
    global audio_processor, asr_engine, sentiment_analyzer, summarizer, diarizer
    logger.info("Loading AI models...")
    create_tables()
    audio_processor = AudioProcessor(sample_rate=16000)
    asr_engine = ASREngine(model_size="small", device="cpu")
    sentiment_analyzer = SentimentAnalyzer()
    summarizer = MeetingSummarizer()
    diarizer = SpeakerDiarizer()
    logger.info("All models loaded successfully.")
    
@measure_latency("vad_detection")
def detect_speech_timed(chunk):
    return audio_processor.detect_speech(chunk)

@measure_latency("whisper_transcription")
def transcribe_timed(chunk):
    return asr_engine.transcribe(chunk)

@measure_latency("speaker_diarization")
def identify_speaker_timed(chunk):
    return diarizer.identify_speaker(chunk)

@measure_latency("sentiment_analysis")
def analyze_sentiment_timed(text):
    return sentiment_analyzer.analyze(text)
    
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".mp4", ".m4a", ".ogg", ".flac", ".mov"}
ALLOWED_MIME_TYPES = {
    "audio/wav", "audio/mpeg", "audio/x-m4a", "audio/ogg",
    "audio/flac", "video/mp4", "video/quicktime"
}

@app.post("/api/v1/meetings/import")
async def import_audio_file(file: UploadFile = File(...)):
    if not audio_processor or not asr_engine:
        raise HTTPException(status_code=503, detail="Modèles IA non chargés")

    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Extension non autorisée : {suffix}")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Type MIME non autorisé : {file.content_type}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        import soundfile as sf
        import librosa

        audio_data, sr = sf.read(tmp_path, dtype="float32")
        if audio_data.ndim > 1:
            audio_data = audio_data.mean(axis=1)
        if sr != 16000:
            audio_data = librosa.resample(audio_data, orig_sr=sr, target_sr=16000)

        total_samples = len(audio_data)
        logger.info(f"Fichier importé : {file.filename} ({total_samples/16000:.1f}s)")

        session_id = str(uuid.uuid4())
        db = SessionLocal()
        meeting = Meeting(
            session_id=session_id,
            title=file.filename or "Réunion importée",
            started_at=datetime.utcnow(),
            status="active",
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)

        diarizer.reset()

        CHUNK_SIZE = 16000 * 4
        STEP = CHUNK_SIZE // 2
        full_transcript_for_summary = []

        for start in range(0, total_samples, STEP):
            chunk = audio_data[start:start + CHUNK_SIZE]
            if len(chunk) < 16000:
                continue

            if not detect_speech_timed(chunk):
                continue

            try:
                result = transcribe_timed(chunk)
            except Exception as e:
                logger.error(f"Whisper error on import: {e}")
                continue

            text = result["text"].strip()
            if len(text) < 5 or "don't know" in text.lower():
                continue

            speaker = identify_speaker_timed(chunk)
            sentiment = analyze_sentiment_timed(text)

            entry = Transcript(
                meeting_id=meeting.id,
                speaker=speaker,
                text=text,
                language=result.get("language", "fr"),
                timestamp=datetime.utcnow(),
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
            )
            db.add(entry)
            full_transcript_for_summary.append(f"{speaker}: {text}")

        db.commit()

        meeting.status = "completed"
        meeting.ended_at = datetime.utcnow()
        meeting.num_speakers = diarizer.speaker_counter
        db.commit()

        if full_transcript_for_summary:
            logger.info("Génération du résumé pour le fichier importé...")
            try:
                summary_json = summarizer.summarize(full_transcript_for_summary)
                summary_data = json.loads(summary_json)
                new_summary = Summary(
                    meeting_id=meeting.id,
                    content=summary_json,
                    action_items=json.dumps(summary_data.get("actions", [])),
                    created_at=datetime.utcnow(),
                )
                db.add(new_summary)
                db.commit()
                logger.info("Résumé généré pour le fichier importé.")
            except Exception as e:
                logger.error(f"Erreur résumé import: {e}")

        db.close()

        return {
            "session_id": session_id,
            "meeting_id": meeting.id,
            "segments_transcribed": len(full_transcript_for_summary),
            "status": "completed",
        }

    finally:
        os.unlink(tmp_path)



@app.websocket("/ws/meeting/{session_id}")
async def websocket_meeting(websocket: WebSocket, session_id: str):
    await websocket.accept()
    active_sessions[session_id] = websocket
    logger.info(f"Session {session_id} connected.")

    db = SessionLocal()
    meeting = db.query(Meeting).filter(Meeting.session_id == session_id).first()
    if not meeting:
        meeting = Meeting(
            session_id=session_id,
            started_at=datetime.utcnow(),
            status="active",
        )
        db.add(meeting)
        db.commit()
        db.refresh(meeting)

    diarizer.reset()  # évite la contamination des embeddings entre deux sessions successives

    audio_buffer = []
    full_transcript_for_summary = []
    CHUNK_PROCESS_SIZE = 16000 * 4

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_bytes(), timeout=60.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue

            audio_chunk = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0

            rms = float(np.sqrt(np.mean(audio_chunk ** 2)))
            if 0.0001 < rms < 0.01:
                audio_chunk = np.clip(audio_chunk * 10.0, -1.0, 1.0)

            audio_buffer.extend(audio_chunk.tolist())

            if len(audio_buffer) < CHUNK_PROCESS_SIZE:
                continue

            chunk = np.array(audio_buffer[:CHUNK_PROCESS_SIZE], dtype=np.float32)
            audio_buffer = audio_buffer[CHUNK_PROCESS_SIZE // 2:]

            if not detect_speech_timed(chunk):
                continue

            try:
                transcript_result = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(
                        None, transcribe_timed, chunk
                    ),
                    timeout=45.0,
                )
            except asyncio.TimeoutError:
                logger.error("Whisper Timeout: la transcription a dépassé 45s, segment ignoré.")
                continue
            except Exception as e:
                logger.error(f"Whisper Error: {e}")
                continue

            text = transcript_result["text"].strip()

            if len(text) < 5 or "don't know" in text.lower():
                continue

            logger.info(f"Transcribed: '{text}'")

            try:
                speaker = identify_speaker_timed(chunk)
            except Exception as e:
                logger.error(f"Diarization Error: {e}")
                speaker = "Inconnu"

            try:
                sentiment = analyze_sentiment_timed(text)
            except Exception as e:
                logger.error(f"Sentiment Analysis Error: {e}")
                sentiment = {"score": 0.0, "label": "neutral"}

            entry = Transcript(
                meeting_id=meeting.id,
                speaker=speaker,
                text=text,
                language=transcript_result.get("language", "fr"),
                timestamp=datetime.utcnow(),
                sentiment_score=sentiment["score"],
                sentiment_label=sentiment["label"],
            )
            db.add(entry)
            db.commit()

            full_transcript_for_summary.append(f"{speaker}: {text}")

            await websocket.send_text(json.dumps({
                "type": "transcript",
                "speaker": speaker,
                "text": text,
                "language": transcript_result.get("language", "fr"),
                "sentiment": sentiment,
                "timestamp": datetime.utcnow().isoformat(),
            }))

    except WebSocketDisconnect:
        logger.info(f"Session {session_id} disconnected.")
    finally:
        meeting.status = "completed"
        meeting.ended_at = datetime.utcnow()
        meeting.num_speakers = diarizer.speaker_counter
        db.commit()

        if full_transcript_for_summary:
            logger.info("Lancement de la génération du résumé...")
            try:
                summary_json = summarizer.summarize(full_transcript_for_summary)
                summary_data = json.loads(summary_json)
                new_summary = Summary(
                    meeting_id=meeting.id,
                    content=summary_json,
                    action_items=json.dumps(summary_data.get("actions", [])),
                    created_at=datetime.utcnow(),
                )
                db.add(new_summary)
                db.commit()
                logger.info("Résumé enregistré en base de données.")
            except Exception as e:
                logger.error(f"Erreur lors du résumé : {e}")

        db.close()
        active_sessions.pop(session_id, None)
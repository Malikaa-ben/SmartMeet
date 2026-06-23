"""
Database Models - SQLAlchemy ORM
Stores meetings, transcripts, and summaries securely.
"""

import os
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, Float,
    DateTime, ForeignKey, Boolean
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./meetingai.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Meeting(Base):
    """Represents a single meeting session."""
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="active")  # active, completed, error
    language = Column(String(10), nullable=True)
    num_speakers = Column(Integer, default=0)

    transcripts = relationship("Transcript", back_populates="meeting", cascade="all, delete-orphan")
    summaries = relationship("Summary", back_populates="meeting", cascade="all, delete-orphan")

    @property
    def duration_seconds(self):
        if self.ended_at and self.started_at:
            return int((self.ended_at - self.started_at).total_seconds())
        return None


class Transcript(Base):
    """Individual transcript segment (utterance)."""
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    speaker = Column(String(64), default="Unknown")
    text = Column(Text, nullable=False)
    language = Column(String(10), default="unknown")
    timestamp = Column(DateTime, default=datetime.utcnow)
    sentiment_score = Column(Float, default=0.0)
    sentiment_label = Column(String(20), default="neutral")
    confidence = Column(Float, default=0.0)

    meeting = relationship("Meeting", back_populates="transcripts")


class Summary(Base):
    """AI-generated meeting summary."""
    __tablename__ = "summaries"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id"), nullable=False)
    content = Column(Text, nullable=False)       
    action_items = Column(Text, default="[]")    
    created_at = Column(DateTime, default=datetime.utcnow)

    meeting = relationship("Meeting", back_populates="summaries")


def get_db():
    """Dependency for FastAPI route injection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Initialize database schema."""
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    create_tables()
    print("Database tables created.")
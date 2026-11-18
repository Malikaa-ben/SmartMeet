# SmartMeet

**SmartMeet** est un assistant intelligent de réunions. Il transcrit la parole en temps réel (ou depuis un fichier audio/vidéo importé), identifie les intervenants, analyse le sentiment de chaque prise de parole, génère un compte rendu structuré et permet d'interroger l'historique des réunions en langage naturel grâce à un agent IA.

Tous les modèles tournent **en local** (aucune donnée envoyée vers un service cloud), ce qui garantit la confidentialité des échanges.

> Projet de fin d'année (PFA).

## Fonctionnalités

- **Transcription en temps réel** via WebSocket (micro du navigateur) avec [faster-whisper](https://github.com/SYSTRAN/faster-whisper), multilingue : français, anglais, arabe/darija
- **Import de fichiers** audio/vidéo (`.wav`, `.mp3`, `.mp4`, `.m4a`, `.ogg`, `.flac`, `.mov`) pour transcrire une réunion enregistrée
- **Détection de parole (VAD)** avec Silero VAD pour ignorer les silences
- **Diarisation** : identification des locuteurs par embeddings vocaux (pyannote / wespeaker), avec un mode heuristique de secours
- **Analyse de sentiment** (positif / neutre / négatif) par un modèle transformer multilingue
- **Résumé automatique** : résumé exécutif, points clés, décisions et actions, généré par un LLM local (Ollama)
- **Agent IA conversationnel** : pose des questions en langage naturel sur tes réunions (« Qui parle le plus ? », « Quel est le sentiment dominant ? »), traduites en requêtes SQL en lecture seule
- **Export** des réunions en Markdown ou JSON
- **Tableau de bord** React : liste des réunions, détail, transcription, résumé, chat avec l'agent
- **Mesure de performance** : latence de chaque étape du pipeline (VAD, Whisper, diarisation, sentiment) et scripts de test de mémoire

## Architecture

```
Audio (micro / fichier)
        │
        ▼
 Silero VAD ──► faster-whisper (ASR) ──► Diarisation ──► Sentiment
                                                              │
                                                              ▼
                                         Base de données (SQLite / PostgreSQL)
                                                              │
                                   ┌──────────────────────────┴───────────┐
                                   ▼                                      ▼
                       Résumé (Ollama, llama3.2:3b)          Agent IA (texte → SQL)
                                   │                                      │
                                   └──────────────► API FastAPI ◄─────────┘
                                                         │
                                                         ▼
                                                Frontend React (Vite)
```

## Structure du projet

```
Projet_pfa/
├── backend/
│   ├── main.py             # API FastAPI, WebSocket temps réel, import de fichiers
│   ├── routes.py           # Routes REST (/api/v1/...)
│   ├── models.py           # Modèles SQLAlchemy : Meeting, Transcript, Summary
│   ├── processor.py        # Traitement audio et détection de parole (Silero VAD)
│   ├── asr.py              # Reconnaissance vocale (faster-whisper)
│   ├── diarizer.py         # Identification des locuteurs
│   ├── sentiment.py        # Analyse de sentiment (transformers)
│   ├── summarizer.py       # Génération du compte rendu (Ollama)
│   ├── agent.py            # Agent IA : question → SQL → réponse
│   ├── eval_agent.py       # Évaluation de l'agent sur la base réelle
│   ├── test_*.py           # Tests de latence et de mémoire
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Meetingroom, Meetingdetail, ImportPage, AgentChat
        └── hooks/          # useAudioStream (capture et envoi audio)
```

## Technologies

| Domaine | Outils |
|---|---|
| Backend | Python, FastAPI, Uvicorn, WebSockets, SQLAlchemy |
| Transcription | faster-whisper (modèle `small`, CPU, int8) |
| VAD | Silero VAD |
| Diarisation | pyannote.audio (`wespeaker-voxceleb-resnet34-LM`) |
| Sentiment | `tabularisai/multilingual-sentiment-analysis` (Hugging Face) |
| Résumé et agent | Ollama + `llama3.2:3b` |
| Base de données | SQLite (développement), PostgreSQL possible |
| Frontend | React 19, Vite |

## Prérequis

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com) installé, avec le modèle :
  ```bash
  ollama pull llama3.2:3b
  ```
- (Optionnel) un token Hugging Face pour la diarisation par pyannote. Sans token, un mode heuristique est utilisé.

## Installation

### 1. Cloner le dépôt

```bash
git clone <url-du-depot>
cd smartmeet
```

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux / macOS

pip install -r requirements.txt
```

Crée un fichier `.env` dans `backend/` :

```env
HF_TOKEN=ton_token_huggingface        # diarisation pyannote (optionnel)
OLLAMA_MODEL=llama3.2:3b
OLLAMA_BASE=http://localhost:11434
# DATABASE_URL=sqlite:///./meetingai.db   # par défaut
```

> Le fichier `.env` ne doit jamais être publié sur GitHub (il est déjà dans le `.gitignore`).

### 3. Frontend

```bash
cd frontend
npm install
```

Optionnel, dans `frontend/.env` (valeurs par défaut ci-dessous) :

```env
VITE_API_URL=http://localhost:8001/api/v1
VITE_WS_URL=ws://localhost:8001/ws/meeting
```

## Lancement

Dans trois terminaux :

```bash
# 1. Ollama
ollama serve

# 2. Backend (depuis backend/)
uvicorn main:app --host 0.0.0.0 --port 8001 --reload

# 3. Frontend (depuis frontend/)
npm run dev
```

- Interface : `http://localhost:5173`
- Documentation interactive de l'API : `http://localhost:8001/docs`

Au premier démarrage, les modèles (Whisper, sentiment, VAD) sont téléchargés puis chargés en mémoire, ce qui peut prendre quelques minutes.

## API

Préfixe : `/api/v1`

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/meetings` | Liste des réunions |
| `GET` | `/meetings/{session_id}` | Détail d'une réunion |
| `GET` | `/meetings/{session_id}/transcript` | Transcription avec locuteurs et sentiments |
| `GET` | `/meetings/{session_id}/summary` | Résumé, points clés, décisions, actions |
| `POST` | `/meetings/{session_id}/regenerate-summary` | Regénérer le résumé |
| `GET` | `/meetings/{session_id}/export?fmt=markdown\|json` | Exporter une réunion |
| `DELETE` | `/meetings/{session_id}` | Supprimer une réunion |
| `POST` | `/meetings/import` | Importer un fichier audio/vidéo |
| `POST` | `/agent/ask` | Poser une question à l'agent IA |
| `WS` | `/ws/meeting/{session_id}` | Flux audio en temps réel |

## Évaluation et tests

```bash
cd backend
python eval_agent.py              # teste les requêtes de l'agent sur la base réelle
python test_latency_summer.py     # latence du résumé
python test_memory_usage.py       # consommation mémoire
```

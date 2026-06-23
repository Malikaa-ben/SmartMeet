import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8001/ws/meeting";
const SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 2000;   // 2 secondes par chunk
const SCRIPT_BUFFER_SIZE = 4096;
const GAIN_LEVEL = 2.5;       // ✅ Amplification x8 pour micro faible

export function useAudioStream() {
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [connectionState, setConnectionState] = useState("idle");
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState({ chunksSent: 0, lastRMS: 0 });

  const wsRef = useRef(null);
  const contextRef = useRef(null);
  const processorRef = useRef(null);
  const gainRef = useRef(null);
  const streamRef = useRef(null);
  const bufferRef = useRef([]);
  const debugRef = useRef({ chunksSent: 0 });

  const startRecording = useCallback(async () => {
    const sid = uuidv4();
    setSessionId(sid);
    setTranscripts([]);
    setError(null);
    bufferRef.current = [];
    debugRef.current = { chunksSent: 0 };
    setConnectionState("connecting");

    console.log("🎙️ Session démarrée :", sid);

    // 1. WebSocket
    const ws = new WebSocket(`${WS_URL}/${sid}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connecté !");
      setConnectionState("connected");
      setIsRecording(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("📨 Reçu :", data);
        if (data.type === "ping") return; // ignore keepalive
        if (data.type === "transcript" && data.text?.trim()) {
          setTranscripts((prev) => [...prev, {
            id: Date.now(),
            speaker: data.speaker,
            text: data.text,
            language: data.language,
            sentiment: data.sentiment,
            timestamp: data.timestamp,
          }]);
        }
        if (data.type === "error") {
          setError(data.message);
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    };

    ws.onerror = () => {
      setConnectionState("error");
      setError("WebSocket échoué. Backend démarré sur port 8000 ?");
      setIsRecording(false);
    };

    ws.onclose = (e) => {
      console.log("🔌 WS fermé. Code:", e.code, "Raison:", e.reason);
      setConnectionState("idle");
      setIsRecording(false);
    };

    // 2. Microphone
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,  // ✅ Désactivé : peut couper la voix
          noiseSuppression: false,  // ✅ Désactivé : peut filtrer trop agressivement
          autoGainControl: false,   // ✅ Désactivé : on gère le gain manuellement
        },
        video: false,
      });
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      console.log("🎤 Micro:", track.label, track.getSettings());

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContext();
      contextRef.current = context;

      const source = context.createMediaStreamSource(stream);

      // ✅ Nœud de gain pour amplifier le signal faible
      const gainNode = context.createGain();
      gainNode.gain.value = GAIN_LEVEL;
      gainRef.current = gainNode;

      // Resampler vers 16kHz
      const targetSamples = Math.floor((SAMPLE_RATE * CHUNK_DURATION_MS) / 1000);
      const processor = context.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const inputRate = context.sampleRate;

        // Resample vers 16kHz si nécessaire
        let samples;
        if (inputRate !== SAMPLE_RATE) {
          const ratio = SAMPLE_RATE / inputRate;
          const outLen = Math.floor(inputData.length * ratio);
          samples = new Float32Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const srcIdx = i / ratio;
            const lo = Math.floor(srcIdx);
            const hi = Math.min(lo + 1, inputData.length - 1);
            const frac = srcIdx - lo;
            samples[i] = inputData[lo] * (1 - frac) + inputData[hi] * frac;
          }
        } else {
          samples = inputData;
        }

        bufferRef.current.push(...Array.from(samples));

        if (bufferRef.current.length >= targetSamples) {
          const chunk = bufferRef.current.splice(0, targetSamples);

          const rms = Math.sqrt(chunk.reduce((s, v) => s + v * v, 0) / chunk.length);

          const int16 = new Int16Array(
            chunk.map((s) => Math.max(-32768, Math.min(32767, Math.round(s * 32767))))
          );

          wsRef.current.send(int16.buffer);
          debugRef.current.chunksSent++;

          const status = rms < 0.005 ? "⚠️ FAIBLE" : "✅";
          console.log(`📤 Chunk #${debugRef.current.chunksSent} | RMS: ${rms.toFixed(4)} ${status} | ${int16.buffer.byteLength} octets`);

          setDebugInfo({ chunksSent: debugRef.current.chunksSent, lastRMS: rms.toFixed(4) });
        }
      };

      // Pipeline: source → gain → processor → (sortie muette)
      source.connect(gainNode);
      gainNode.connect(processor);
      processor.connect(context.destination);

      console.log(`✅ Audio démarré. Gain x${GAIN_LEVEL}. Parlez !`);

    } catch (err) {
      console.error("❌ Micro erreur:", err);
      setError(err.name === "NotAllowedError"
        ? "Permission micro refusée."
        : `Micro inaccessible: ${err.message}`);
      ws.close();
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
    if (gainRef.current) { gainRef.current.disconnect(); gainRef.current = null; }
    if (contextRef.current) { contextRef.current.close(); contextRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    bufferRef.current = [];
    setIsRecording(false);
    setConnectionState("idle");
    console.log("⏹️ Enregistrement arrêté.");
  }, []);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return { isRecording, sessionId, transcripts, connectionState, error, debugInfo, startRecording, stopRecording };
}
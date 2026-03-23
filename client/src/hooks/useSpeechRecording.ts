/**
 * useSpeechRecording
 *
 * Manages the full browser-side recording lifecycle:
 *   idle → recording → transcribing → idle (or error)
 *
 * On successful transcription the `onTranscribed` callback receives the text.
 * Auth token is read from tokenStore and sent as a Bearer header so the
 * server-side requireAuth middleware accepts the request.
 */

import { useState, useRef } from "react";
import { getAccessToken } from "@/lib/tokenStore";

export type RecordingState = "idle" | "recording" | "transcribing" | "error";

function getBestMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function extForMime(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/mp4")) return "mp4";
  return "webm";
}

interface UseSpeechRecordingOptions {
  onTranscribed: (text: string) => void;
  onError?: (msg: string) => void;
}

export function useSpeechRecording({ onTranscribed, onError }: UseSpeechRecordingOptions) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getBestMimeType();
      mimeTypeRef.current = mimeType;

      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const finalMime = mimeTypeRef.current || mr.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        await sendForTranscription(blob, finalMime);
      };

      mr.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = mr;
      setState("recording");
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access and try again."
          : err?.message || "Could not start recording.";
      setError(msg);
      onError?.(msg);
      setState("error");
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      setState("transcribing");
      mediaRecorderRef.current.stop();
    }
  }

  function cancelRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      // Nullify onstop so we don't transcribe
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    setState("idle");
    setError(null);
  }

  async function sendForTranscription(blob: Blob, mimeType: string) {
    try {
      const ext = extForMime(mimeType);
      const fd = new FormData();
      fd.append("audio", blob, `recording.${ext}`);

      const token = getAccessToken();
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Transcription failed (${res.status}).`);
      }

      const { text } = await res.json();
      if (!text?.trim()) throw new Error("No speech detected. Please try again.");

      onTranscribed(text.trim());
      setState("idle");
    } catch (err: any) {
      const msg = err?.message || "Transcription failed. Please try again.";
      setError(msg);
      onError?.(msg);
      setState("error");
    }
  }

  function reset() {
    setState("idle");
    setError(null);
  }

  return { state, error, startRecording, stopRecording, cancelRecording, reset };
}

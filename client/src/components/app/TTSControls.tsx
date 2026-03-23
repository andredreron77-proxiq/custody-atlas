/**
 * TTSControls
 *
 * Speaker / TTS button attached to each assistant response card.
 *
 * Voices exposed to the user (mapped to real OpenAI voices on the server):
 *   Marin  → nova   (warm, friendly)
 *   Cedar  → onyx   (deep, authoritative)
 *   Alloy  → alloy  (balanced, neutral)
 *
 * Playback is handled by a hidden <audio> element so the browser controls
 * volume/pause natively and mobile works without Web Audio API complexity.
 */

import { useState, useRef } from "react";
import { Volume2, Pause, Play, RotateCcw, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAccessToken } from "@/lib/tokenStore";

export type TTSVoice = "marin" | "cedar" | "alloy";

const VOICE_LABELS: Record<TTSVoice, string> = {
  marin: "Marin",
  cedar: "Cedar",
  alloy: "Alloy",
};

type PlayState = "idle" | "loading" | "playing" | "paused" | "error";

interface TTSControlsProps {
  text: string;
  defaultVoice?: TTSVoice;
  className?: string;
}

export function TTSControls({ text, defaultVoice = "marin", className }: TTSControlsProps) {
  const [voice, setVoice] = useState<TTSVoice>(defaultVoice);
  const [playState, setPlayState] = useState<PlayState>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioBlobUrlRef = useRef<string | null>(null);

  function cleanup() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current);
      audioBlobUrlRef.current = null;
    }
  }

  async function fetchAndPlay(selectedVoice: TTSVoice) {
    cleanup();
    setPlayState("loading");

    try {
      const token = getAccessToken();
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice: selectedVoice }),
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `TTS failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioBlobUrlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => setPlayState("playing");
      audio.onpause = () => setPlayState("paused");
      audio.onended = () => setPlayState("idle");
      audio.onerror = () => setPlayState("error");

      await audio.play();
    } catch (err: any) {
      console.error("[TTS] error:", err);
      setPlayState("error");
    }
  }

  function handlePlay() {
    fetchAndPlay(voice);
  }

  function handlePause() {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }

  function handleResume() {
    if (audioRef.current) {
      audioRef.current.play();
    }
  }

  function handleReplay() {
    fetchAndPlay(voice);
  }

  function handleVoiceChange(newVoice: TTSVoice) {
    setVoice(newVoice);
    // If currently playing, restart with new voice
    if (playState === "playing" || playState === "paused") {
      fetchAndPlay(newVoice);
    }
  }

  const isLoading = playState === "loading";
  const isPlaying = playState === "playing";
  const isPaused = playState === "paused";
  const isError = playState === "error";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* Main play/pause/replay button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={
          isPlaying
            ? handlePause
            : isPaused
            ? handleResume
            : playState === "idle" || isError
            ? handlePlay
            : undefined
        }
        disabled={isLoading}
        className={cn(
          "h-7 w-7 p-0 rounded-full transition-colors",
          isPlaying && "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30",
          isError && "text-destructive"
        )}
        aria-label={
          isLoading
            ? "Generating audio…"
            : isPlaying
            ? "Pause"
            : isPaused
            ? "Resume"
            : "Read aloud"
        }
        data-testid="button-tts-play"
        title={
          isLoading
            ? "Generating audio…"
            : isPlaying
            ? "Pause"
            : isPaused
            ? "Resume"
            : "Read aloud"
        }
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-3.5 h-3.5" />
        ) : isPaused ? (
          <Play className="w-3.5 h-3.5" />
        ) : (
          <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </Button>

      {/* Replay button — only visible when paused or idle after playing */}
      {(isPaused || (playState === "idle" && audioBlobUrlRef.current)) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReplay}
          className="h-7 w-7 p-0 rounded-full"
          aria-label="Replay from start"
          data-testid="button-tts-replay"
          title="Replay from start"
        >
          <RotateCcw className="w-3 h-3 text-muted-foreground" />
        </Button>
      )}

      {/* Voice selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 gap-0.5 text-xs text-muted-foreground hover:text-foreground rounded-full"
            data-testid="button-tts-voice-selector"
            title="Change voice"
          >
            {VOICE_LABELS[voice]}
            <ChevronDown className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Voice
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(["marin", "cedar", "alloy"] as TTSVoice[]).map((v) => (
            <DropdownMenuItem
              key={v}
              onClick={() => handleVoiceChange(v)}
              className={cn(
                "text-sm cursor-pointer",
                voice === v && "font-medium text-blue-600 dark:text-blue-400"
              )}
              data-testid={`option-voice-${v}`}
            >
              {VOICE_LABELS[v]}
              {voice === v && <span className="ml-auto text-xs opacity-60">✓</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

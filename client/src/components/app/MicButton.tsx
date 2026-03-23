/**
 * MicButton
 *
 * Large tap-friendly microphone button for the ChatBox input area.
 *
 * States:
 *  idle         — mic icon, click starts recording
 *  recording    — red pulsing button, click stops and transcribes
 *  transcribing — spinner, non-interactive
 *  error        — shows briefly before resetting
 */

import { Mic, MicOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecordingState } from "@/hooks/useSpeechRecording";

interface MicButtonProps {
  state: RecordingState;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
  disabled?: boolean;
  className?: string;
}

export function MicButton({
  state,
  onStart,
  onStop,
  onCancel,
  disabled = false,
  className,
}: MicButtonProps) {
  const isRecording = state === "recording";
  const isTranscribing = state === "transcribing";
  const isError = state === "error";
  const isDisabled = disabled || isTranscribing;

  function handleClick() {
    if (isDisabled) return;
    if (isRecording) {
      onStop();
    } else if (isError) {
      onCancel();
    } else {
      onStart();
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={
        isRecording
          ? "Stop recording and transcribe"
          : isTranscribing
          ? "Transcribing..."
          : "Record voice question"
      }
      data-testid="button-mic"
      className={cn(
        "relative flex items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // size
        "w-10 h-10",
        // idle
        !isRecording && !isTranscribing && !isError &&
          "bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground border border-border",
        // recording — red pulse
        isRecording &&
          "bg-red-500 hover:bg-red-600 text-white border-0 shadow-lg shadow-red-500/30",
        // transcribing
        isTranscribing &&
          "bg-muted text-muted-foreground border border-border opacity-70 cursor-not-allowed",
        // error
        isError &&
          "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700",
        className,
      )}
    >
      {/* Pulsing ring when recording */}
      {isRecording && (
        <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
      )}

      {isTranscribing ? (
        <Loader2 className="w-4 h-4 animate-spin relative z-10" />
      ) : isRecording ? (
        <MicOff className="w-4 h-4 relative z-10" />
      ) : isError ? (
        <X className="w-4 h-4 relative z-10" />
      ) : (
        <Mic className="w-4 h-4 relative z-10" />
      )}
    </button>
  );
}

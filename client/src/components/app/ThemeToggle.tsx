import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";

type Theme = "light" | "dark" | "system";

const CYCLE: Theme[] = ["light", "dark", "system"];

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<Theme, string> = {
  light: "Light mode (click for dark)",
  dark: "Dark mode (click for system)",
  system: "System theme (click for light)",
};

const NEXT_LABELS: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  function cycleTheme() {
    const idx = CYCLE.indexOf(theme);
    setTheme(CYCLE[(idx + 1) % CYCLE.length]);
  }

  const Icon = ICONS[theme];

  if (compact) {
    return (
      <button
        onClick={cycleTheme}
        aria-label={LABELS[theme]}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-white/8 border border-transparent transition-colors"
        data-testid="button-theme-toggle-mobile"
      >
        <span className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1">{NEXT_LABELS[theme]} Mode</span>
      </button>
    );
  }

  return (
    <button
      onClick={cycleTheme}
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
      className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
      data-testid="button-theme-toggle"
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

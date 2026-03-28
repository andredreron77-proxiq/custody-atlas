import { Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

interface ThemeToggleProps {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function toggle() {
    setTheme(isDark ? "light" : "dark");
  }

  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label={label}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-lg text-base font-medium text-slate-300 hover:text-white hover:bg-white/8 border border-transparent transition-colors"
        data-testid="button-theme-toggle-mobile"
      >
        <span className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </span>
        <span className="flex-1">{isDark ? "Light" : "Dark"} Mode</span>
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="flex items-center justify-center w-8 h-8 rounded-md text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
      data-testid="button-theme-toggle"
    >
      {isDark ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}

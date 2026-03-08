import { Scale, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
                <Scale className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="font-semibold text-sm">Custody Law Near Me</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Helping families understand custody law in their jurisdiction with clear, plain-English explanations.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-sm mb-3">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/location" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Find My Laws
                </Link>
              </li>
              <li>
                <Link href="/ask" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Ask AI
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-sm mb-3">Disclaimer</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This tool provides general legal information, not legal advice. Always consult a licensed family law attorney in your jurisdiction for advice specific to your situation.
            </p>
          </div>
        </div>

        <div className="border-t pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Custody Law Near Me. For informational purposes only.
          </p>
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-md px-3 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-700 dark:text-amber-300">Not legal advice — consult a lawyer</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Scale, Shield, BookOpen } from "lucide-react";
import { Link } from "wouter";

const TRUST_SIGNALS = [
  { icon: Shield, label: "Secure document analysis" },
  { icon: BookOpen, label: "Educational legal information" },
  { icon: Scale, label: "Not a substitute for a lawyer" },
];

export function Footer() {
  return (
    <footer className="bg-[#0f172a] text-slate-300 mt-auto">

      {/* Trust signal bar */}
      <div className="border-b border-white/8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {TRUST_SIGNALS.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <span className="text-xs text-slate-400 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main footer body */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">

          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                <Scale className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-white text-sm tracking-tight">Custody Atlas</span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-3 max-w-xs">
              Helping families understand custody law in their jurisdiction with clear, plain-English explanations.
            </p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
              Custody Atlas provides educational legal information only. It does not offer legal representation or legal advice.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white text-sm mb-3">Quick Links</h3>
            <ul className="space-y-2">
              {[
                { label: "Home", href: "/" },
                { label: "Custody Map", href: "/custody-map" },
                { label: "Ask AI", href: "/ask" },
                { label: "Analyze Document", href: "/upload-document" },
              ].map(({ label, href }) => (
                <li key={label}>
                  <Link href={href} className="text-sm text-slate-400 hover:text-white transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold text-white text-sm mb-3">Legal</h3>
            <ul className="space-y-2 mb-4">
              <li>
                <Link href="/privacy" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-slate-400 hover:text-white transition-colors">
                  Terms of Use
                </Link>
              </li>
            </ul>
            <p className="text-xs text-slate-500 leading-relaxed">
              This tool provides general legal information, not legal advice. Always consult a licensed family law attorney.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/8 pt-6 flex flex-col sm:flex-row items-start sm:items-center gap-2 justify-between">
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} Custody Atlas. For informational purposes only.
          </p>
          <div className="flex items-center gap-1.5 bg-amber-950/60 border border-amber-800/40 rounded-md px-3 py-1.5">
            <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-300/80">Not legal advice — always consult a licensed attorney</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

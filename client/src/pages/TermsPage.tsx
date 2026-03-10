import { Link } from "wouter";
import { ArrowLeft, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    title: "What Custody Atlas is",
    content: [
      "Custody Atlas is an educational tool that helps you understand child custody laws in your state and county.",
      "The information provided is general in nature. It is based on publicly available legal information and is not a substitute for advice from a licensed family law attorney.",
      "Custody Atlas does not provide legal representation. Using this tool does not create an attorney-client relationship.",
    ],
  },
  {
    title: "How you may use this tool",
    content: [
      "You may use Custody Atlas to learn about custody laws, ask general questions, and better understand documents related to your custody situation.",
      "You may not use Custody Atlas for any unlawful purpose or in any way that could harm others.",
      "You are responsible for how you use the information provided. Always verify important legal information with a licensed attorney before taking action.",
    ],
  },
  {
    title: "Accuracy of information",
    content: [
      "We work to keep the information in Custody Atlas accurate and up to date, but laws change. The information provided may not reflect recent changes in your state's laws.",
      "AI-generated responses are based on the information available to the AI at the time. They may contain errors or omissions.",
      "Always confirm important legal details with a licensed attorney in your jurisdiction before making decisions.",
    ],
  },
  {
    title: "Limitations of liability",
    content: [
      "Custody Atlas and its operators are not responsible for any decisions you make based on information provided by this tool.",
      "We make no guarantees about the outcome of any legal matter.",
      "If you are facing an urgent legal situation — such as a custody emergency — please contact a licensed attorney or legal aid organization in your area immediately.",
    ],
  },
  {
    title: "Changes to these terms",
    content: [
      "These terms may be updated from time to time. When they are, the updated version will appear here.",
      "By continuing to use Custody Atlas after changes are posted, you agree to the updated terms.",
      "If you have questions about these terms, you can contact us through the support options available in the app.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/">
          <span className="hover:text-foreground cursor-pointer flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </span>
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Terms of Use</span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Terms of Use</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            By using Custody Atlas, you agree to these terms. We've written them in plain language so they're easy to understand.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Short version:</strong> Custody Atlas provides educational information only — not legal advice. Always consult a licensed attorney for decisions about your specific situation.
      </div>

      <div className="space-y-4">
        {SECTIONS.map((section, idx) => (
          <Card key={section.title}>
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <ul className="space-y-2">
                {section.content.map((point, i) => (
                  <li key={i} className="text-sm text-muted-foreground leading-relaxed flex items-start gap-2">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="border-t pt-6 text-center text-sm text-muted-foreground">
        <p>
          Custody Atlas provides educational legal information and does not provide legal representation.{" "}
          <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

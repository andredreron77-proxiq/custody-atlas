import { Link } from "wouter";
import { ArrowLeft, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SECTIONS = [
  {
    title: "Information we collect",
    content: [
      "Custody Atlas is designed to collect as little information as possible.",
      "When you use GPS or enter a ZIP code, your location is used only to identify the laws that apply to your area. We do not store your location on our servers.",
      "When you ask AI questions, your question and your jurisdiction (state and county) are sent to an AI service to generate a response. We do not link these questions to any personal identity.",
      "When you upload a document, the file is sent to our server for text extraction (OCR). The file is deleted immediately after the analysis is complete — typically within seconds.",
      "We do not require you to create an account. We do not collect your name, email, or any identifying information.",
    ],
  },
  {
    title: "How documents are used",
    content: [
      "Documents you upload are used for one purpose only: to extract the text and explain it in plain English using AI.",
      "Your document is not shared with other users. It is not used to train AI models. It is not kept after your analysis is done.",
      "The text extracted from your document may be sent to an AI service (such as OpenAI) to generate the explanation. This is done privately and securely.",
      "We strongly recommend you review any sensitive information in your document before uploading it. Do not upload documents containing Social Security numbers, financial account numbers, or other sensitive personal data beyond what is necessary.",
    ],
  },
  {
    title: "How we protect your data",
    content: [
      "All data sent between your browser and our servers is encrypted using HTTPS (TLS).",
      "Uploaded files are stored only temporarily in memory and deleted immediately after processing.",
      "Location data is never written to a database or log file.",
      "AI questions are processed using third-party AI services under their respective data handling policies. We do not send your name or identifying information alongside these requests.",
      "We do not use cookies for tracking or advertising. Session data (such as your remembered jurisdiction) is stored only in your browser's session storage and is cleared when you close the tab.",
    ],
  },
  {
    title: "User control over uploaded documents",
    content: [
      "You are in full control of what you upload. No document is required to use Custody Atlas — the document upload feature is optional.",
      "Once you close the page or upload a new file, the previous document is gone. We do not retain copies.",
      "If you have questions or concerns about a specific document you uploaded, please contact us (see below) and we will investigate promptly.",
    ],
  },
  {
    title: "Contact for privacy concerns",
    content: [
      "If you have questions about how your data is handled, or if you believe your information has been mishandled, please reach out to us.",
      "You can contact us through the feedback or support options available in the app.",
      "We take privacy concerns seriously and will respond as quickly as possible.",
      "This privacy policy may be updated from time to time. When it is, the updated version will be posted here. We encourage you to review it occasionally.",
    ],
  },
];

export default function PrivacyPage() {
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
        <span className="text-foreground font-medium">Privacy Policy</span>
      </div>

      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            This policy explains what information Custody Atlas collects, how it is used, and how we protect it.
            We use plain English — no legal jargon.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Short version:</strong> We collect as little as possible, we don't sell your data, your uploaded documents are deleted right after analysis, and we never require an account.
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
          <Link href="/terms" className="text-primary hover:underline">Terms of Use</Link>
        </p>
      </div>
    </div>
  );
}

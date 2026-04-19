import { ArrowLeft, Shield } from "lucide-react";
import { Link } from "wouter";

const sections = [
  {
    heading: "1. Overview",
    body: [
      "Custody Atlas (\"we,\" \"us,\" or \"our\") is committed to protecting your privacy. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your information.",
      "This is a sensitive service. We understand that custody matters are deeply personal. We take the protection of your information seriously.",
    ],
  },
  {
    heading: "2. Information We Collect",
    body: ["Information you provide directly:"],
    bullets: [
      "Account information: email address, display name, password",
      "Location information: state and county for jurisdiction-specific guidance",
      "Case information: case names, party names, and details you enter",
      "Uploaded documents: court orders, petitions, worksheets, and other legal documents you upload for analysis",
      "Questions and conversations: the questions you ask and the conversation history within the Service",
    ],
    secondaryHeading: "Information collected automatically:",
    secondaryBullets: [
      "Usage data: which features you use, how often, and for how long",
      "Device information: browser type, operating system, and general device type",
      "Log data: IP address, access times, and pages visited",
    ],
  },
  {
    heading: "3. How We Use Your Information",
    body: ["We use your information to:"],
    bullets: [
      "Provide, operate, and improve the Service",
      "Analyze your uploaded documents and answer your questions using AI",
      "Track usage limits and manage your subscription",
      "Send transactional emails (account creation, billing receipts)",
      "Respond to your support requests",
      "Comply with legal obligations",
    ],
    secondaryHeading: "We do not:",
    secondaryBullets: [
      "Sell your personal information or documents to third parties",
      "Use your documents to train AI models without your consent",
      "Share your custody case details with other users",
      "Display advertising based on your personal information",
    ],
  },
  {
    heading: "4. AI Processing",
    body: [
      "The Service uses AI systems (including OpenAI's GPT models) to analyze documents and answer questions. When you upload a document or ask a question, relevant content is sent to these AI providers for processing.",
      "OpenAI's data handling is governed by their privacy policy at openai.com/privacy. We have data processing agreements in place with our AI providers.",
    ],
  },
  {
    heading: "5. Document Storage and Security",
    body: [
      "Documents you upload are stored securely in our database. We use industry-standard encryption for data in transit and at rest. Access to your documents is restricted to your account only.",
      "We recommend you do not upload documents containing Social Security numbers, financial account numbers, or other sensitive identifiers beyond what is necessary for your case.",
    ],
  },
  {
    heading: "6. Data Sharing",
    body: ["We share your information only in the following circumstances:"],
    bullets: [
      "Service providers: We share data with Supabase (database), Stripe (payments), OpenAI (AI processing), and Google (document analysis) solely to operate the Service",
      "Legal requirements: If required by law, court order, or government authority",
      "Business transfer: In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction",
      "With your consent: For any other purpose with your explicit consent",
    ],
  },
  {
    heading: "7. Data Retention",
    body: [
      "We retain your account information and conversation history for as long as your account is active. Uploaded documents are retained to enable ongoing case analysis. You may request deletion of your data at any time by contacting us.",
    ],
  },
  {
    heading: "8. Your Rights",
    body: ["Depending on your location, you may have rights to:"],
    bullets: [
      "Access the personal information we hold about you",
      "Correct inaccurate information",
      "Request deletion of your information",
      "Object to certain processing of your information",
      "Export your data in a portable format",
    ],
    closing: "To exercise these rights, contact us at andre@custodyatlas.com.",
  },
  {
    heading: "9. Children's Privacy",
    body: [
      "The Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, contact us immediately.",
    ],
  },
  {
    heading: "10. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by posting a notice in the Service. The date at the top of this policy reflects when it was last updated.",
    ],
  },
  {
    heading: "11. Contact",
    body: ["For privacy-related questions or requests, contact us at:"],
    contactLines: [
      "Custody Atlas",
      "Email: andre@custodyatlas.com",
      "Phone: (404) 692-2006",
      "Website: custodyatlas.com",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-10">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-300/80">Custody Atlas</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy Policy</h1>
              <p className="mt-2 text-sm text-slate-400">Last updated: April 17, 2026</p>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-5 py-4 text-sm leading-7 text-cyan-100">
            We do not sell your data, and Custody Atlas is designed for sensitive family-law workflows
            where privacy and careful data handling matter.
          </div>

          <div className="mt-10 space-y-8">
            {sections.map((section) => (
              <section key={section.heading} className="space-y-4">
                <h2 className="text-xl font-semibold text-slate-50">{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-base leading-8 text-slate-300">
                    {paragraph}
                  </p>
                ))}
                {section.bullets ? (
                  <ul className="space-y-3 pl-5 text-base leading-8 text-slate-300 marker:text-cyan-300 list-disc">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.secondaryHeading ? (
                  <h3 className="pt-2 text-lg font-medium text-slate-100">{section.secondaryHeading}</h3>
                ) : null}
                {section.secondaryBullets ? (
                  <ul className="space-y-3 pl-5 text-base leading-8 text-slate-300 marker:text-cyan-300 list-disc">
                    {section.secondaryBullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
                {section.closing ? (
                  <p className="text-base leading-8 text-slate-300">{section.closing}</p>
                ) : null}
                {section.contactLines ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-5 py-4 text-base leading-8 text-slate-300">
                    {section.contactLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

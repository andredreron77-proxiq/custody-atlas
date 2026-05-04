import { ArrowLeft, Building2, HelpCircle, Newspaper } from "lucide-react";
import { Link } from "wouter";

function ContactCard({
  icon: Icon,
  heading,
  body,
  email,
}: {
  icon: typeof HelpCircle;
  heading: string;
  body?: string;
  email: string;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-6 shadow-lg shadow-slate-950/20">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-300">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-50">{heading}</h2>
          {body ? (
            <p className="text-base leading-7 text-slate-300">{body}</p>
          ) : null}
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:border-blue-300/50 hover:bg-blue-500/20 hover:text-white"
          >
            {email}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function ContactPage() {
  return (
    <div className="bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="mt-8 rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/30 sm:p-10">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-blue-300/80">Custody Atlas</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">Contact</h1>
            <p className="mt-3 text-base leading-7 text-slate-300">
              Reach out to the right team and we&apos;ll point you in the right direction.
            </p>
          </div>

          <div className="mt-10 grid gap-5">
            <ContactCard
              icon={HelpCircle}
              heading="Have a question?"
              body="Our support team is here to help."
              email="support@custodyatlas.com"
            />

            <ContactCard
              icon={Building2}
              heading="Interested in partnering with us?"
              body="We work with law firms, legal aid organizations, and family services providers. Reach out to explore licensing, referral partnerships, and white-label options."
              email="partnerships@custodyatlas.com"
            />

            <ContactCard
              icon={Newspaper}
              heading="Media or general inquiries"
              email="press@custodyatlas.com"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

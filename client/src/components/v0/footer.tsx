import Link from "next/link"
import { Logo } from "@/components/navigation"

const footerLinks = {
  product: [
    { label: "Features", href: "/#features" },
    { label: "Custody Map", href: "/custody-map" },
    { label: "Ask Atlas", href: "/ask-atlas" },
    { label: "Document Analysis", href: "/analyze" },
    { label: "Pricing", href: "/pricing" },
  ],
  resources: [
    { label: "Help Center", href: "/help" },
    { label: "Blog", href: "/blog" },
    { label: "Custody Basics", href: "/learn" },
    { label: "State Guides", href: "/guides" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
  company: [
    { label: "About Us", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Careers", href: "/careers" },
  ],
}

export function Footer() {
  return (
    <footer className="bg-navy text-white/80">
      <div className="container py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Logo className="mb-4 [&_span]:text-white" />
            <p className="text-sm text-white/60 mt-4 leading-relaxed">
              AI-powered custody law guidance for parents. Understand your rights, 
              analyze documents, and make informed decisions.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Resources</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-white/60 hover:text-gold transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-xs text-white/40 max-w-4xl">
            <strong>Legal Disclaimer:</strong> Custody Atlas provides general information 
            and AI-powered analysis for educational purposes only. This is not legal advice. 
            The information provided should not be used as a substitute for consultation with 
            a qualified attorney. Laws vary by state and individual circumstances. Always 
            consult with a licensed attorney for legal advice specific to your situation.
          </p>
        </div>

        {/* Copyright */}
        <div className="mt-8 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/50">
            &copy; {new Date().getFullYear()} Custody Atlas. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="#" className="text-sm text-white/50 hover:text-gold transition-colors">
              Twitter
            </Link>
            <Link href="#" className="text-sm text-white/50 hover:text-gold transition-colors">
              LinkedIn
            </Link>
            <Link href="#" className="text-sm text-white/50 hover:text-gold transition-colors">
              Facebook
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

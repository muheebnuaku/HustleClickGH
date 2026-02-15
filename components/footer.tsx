import Link from "next/link";
import { SITE_CONFIG } from "@/lib/constants";
import { Mail, Phone } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-zinc-900 text-zinc-300 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <h3 className="text-white text-lg font-bold mb-4">HUSTLECLICK</h3>
            <p className="text-sm text-zinc-400">
              Building smart systems that connect people, machines, and ideas.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
            <div className="flex flex-col gap-2">
              <a href="#about" className="text-sm hover:text-white transition-colors">
                About
              </a>
              <a href="#projects" className="text-sm hover:text-white transition-colors">
                Projects
              </a>
              <a href="#pricing" className="text-sm hover:text-white transition-colors">
                Services
              </a>
              <Link href="/login" className="text-sm hover:text-white transition-colors">
                Log In
              </Link>
            </div>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-white font-semibold mb-4">Contact Us</h4>
            <div className="flex flex-col gap-3">
              <a
                href={`mailto:${SITE_CONFIG.contact.email}`}
                className="flex items-center gap-2 text-sm hover:text-white transition-colors"
              >
                <Mail size={16} />
                {SITE_CONFIG.contact.email}
              </a>
              <a
                href={SITE_CONFIG.contact.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm hover:text-white transition-colors"
              >
                <Phone size={16} />
                {SITE_CONFIG.contact.phone}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-800 text-center text-sm text-zinc-500">
          © {new Date().getFullYear()} Hustle Click | Built with Innovation & Passion
        </div>
      </div>
    </footer>
  );
}

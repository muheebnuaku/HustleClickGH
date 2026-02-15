"use client";

import Link from "next/link";
import { Menu, X, Home, Info, FolderOpen, Briefcase, Code, GraduationCap, MessageCircle, LogIn } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const navLinks = [
    { href: "#hero", label: "Home", icon: Home },
    { href: "#about", label: "About", icon: Info },
    { href: "#projects", label: "Projects", icon: FolderOpen },
    { href: "#pricing", label: "Services", icon: Briefcase },
    { href: "#skills", label: "Skills", icon: Code },
    { href: "#classes", label: "Classes", icon: GraduationCap },
    { href: "#contact", label: "Contact", icon: MessageCircle },
  ];

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-zinc-200 dark:bg-black/80 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-bold text-foreground">
              HUSTLECLICK
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <Link
                href="/login"
                className="text-sm font-medium bg-foreground text-background px-4 py-2 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                Log In
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 z-50"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Mobile Sidebar */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-white dark:bg-zinc-950 z-50 md:hidden transform transition-transform duration-300 ease-in-out shadow-2xl",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/" className="text-xl font-bold text-foreground" onClick={() => setIsOpen(false)}>
            HUSTLECLICK
          </Link>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex flex-col p-4 space-y-2">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-4 px-4 py-3 rounded-xl text-zinc-600 hover:text-foreground hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-900 transition-all"
            >
              <link.icon size={20} />
              <span className="font-medium">{link.label}</span>
            </a>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href="/login"
            onClick={() => setIsOpen(false)}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-3 rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg"
          >
            <LogIn size={20} />
            Log In
          </Link>
          <Link
            href="/register"
            onClick={() => setIsOpen(false)}
            className="flex items-center justify-center gap-2 w-full mt-3 border-2 border-zinc-300 dark:border-zinc-700 text-foreground px-4 py-3 rounded-xl font-medium hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"
          >
            Create Account
          </Link>
        </div>
      </div>
    </>
  );
}

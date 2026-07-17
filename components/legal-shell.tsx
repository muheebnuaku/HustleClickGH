import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

export function LegalShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="pt-24 pb-16 bg-white dark:bg-zinc-950 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 border-b border-zinc-200 dark:border-zinc-800 pb-6">
            <h1 className="text-3xl font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-zinc-600 dark:text-zinc-400 mt-2">{subtitle}</p>}
            <p className="text-xs text-zinc-500 mt-3">Last updated: {LEGAL_LAST_UPDATED}</p>
          </div>
          <div className="space-y-6 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-blue-600 [&_a]:underline">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

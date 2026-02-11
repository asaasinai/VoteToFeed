import { getPrivacyPolicy } from "@/lib/admin-settings";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const content = await getPrivacyPolicy();

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Header */}
        <div className="mb-10">
          <nav className="mb-6">
            <ol className="flex items-center gap-2 text-sm text-surface-400">
              <li><Link href="/" className="hover:text-surface-600 transition-colors">Home</Link></li>
              <li><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></li>
              <li className="text-surface-700 font-medium">Privacy Policy</li>
            </ol>
          </nav>
          <h1 className="text-3xl font-bold text-surface-900 tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-surface-400 mt-2">Vote to Feed — Powered by iHeartDogs & iHeartCats</p>
        </div>

        {/* Content */}
        <div className="card p-6 sm:p-8">
          {content ? (
            <div className="legal-content">
              <LegalContent text={content} />
            </div>
          ) : (
            <div className="py-16 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-surface-100 flex items-center justify-center mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-surface-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <p className="font-medium text-surface-600">Privacy Policy coming soon</p>
              <p className="text-sm text-surface-400 mt-1">Check back later for our full privacy policy.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LegalContent({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={i} />;

        if (trimmed.startsWith("### "))
          return <h3 key={i} className="text-base font-semibold text-surface-900 mt-5 mb-1.5">{formatInline(trimmed.slice(4))}</h3>;
        if (trimmed.startsWith("## "))
          return <h2 key={i} className="text-lg font-bold text-surface-900 mt-6 mb-2">{formatInline(trimmed.slice(3))}</h2>;
        if (trimmed.startsWith("# "))
          return <h1 key={i} className="text-xl font-bold text-surface-900 mt-8 mb-2">{formatInline(trimmed.slice(2))}</h1>;
        if (trimmed.startsWith("- ") || trimmed.startsWith("* "))
          return <li key={i} className="ml-5 text-sm text-surface-600 list-disc leading-relaxed">{formatInline(trimmed.slice(2))}</li>;

        return <p key={i} className="text-sm text-surface-600 leading-relaxed mb-2">{formatInline(trimmed)}</p>;
      })}
    </>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    if (boldMatch && boldMatch.index !== undefined) {
      if (boldMatch.index > 0) parts.push(remaining.slice(0, boldMatch.index));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch.index + boldMatch[0].length);
      continue;
    }
    parts.push(remaining);
    break;
  }
  return <>{parts}</>;
}

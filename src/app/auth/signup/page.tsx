"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/dashboard";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Step 1: Register the account
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Sign up failed"); setLoading(false); return; }

      // Step 2: Automatically log them in
      const loginRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (loginRes?.error) {
        // Fallback: redirect to sign-in page if auto-login fails
        window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
        return;
      }

      if (loginRes?.url) {
        setSuccess(true);
        setTimeout(() => { window.location.href = loginRes.url!; }, 4000);
      }
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-500 flex items-center justify-center shadow-glow mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <h2 className="text-2xl font-extrabold text-surface-900 mb-2">You're in! 🎉</h2>
          <p className="text-surface-700 mb-6">Your account is ready. Taking you to your dashboard in a moment…</p>
          <div className="rounded-2xl bg-brand-50 border border-brand-100 p-5 text-left space-y-3">
            <p className="font-bold text-brand-700 text-sm flex items-center gap-2">
              <span className="text-lg">📧</span> Check your email inbox now
            </p>
            <p className="text-sm text-surface-700">We'll send you contest updates, vote alerts, and rank notifications. To make sure they land:</p>
            <ul className="space-y-2 text-sm text-surface-700">
              <li className="flex items-start gap-2">
                <span className="text-brand-500 font-bold mt-0.5">1.</span>
                <span>Open the welcome email from <strong>noreply@votetofeed.com</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-500 font-bold mt-0.5">2.</span>
                <span>If it's in spam — move it to your inbox</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-500 font-bold mt-0.5">3.</span>
                <span>⭐ Star it so contest alerts never get buried</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            </div>
          </Link>
          <h1 className="text-3xl font-extrabold text-surface-900 mt-4 tracking-tight">Create your free account</h1>
          <p className="text-base text-surface-800 mt-1">Vote, support shelter pets, or enter your own pet</p>
        </div>

        {/* Social login */}
        <div className="space-y-2.5 mb-4">
          <button type="button" onClick={() => signIn("google", { callbackUrl })} className="btn-secondary w-full justify-center py-2.5">
            Continue with Google
          </button>
          <button type="button" onClick={() => signIn("facebook", { callbackUrl })} className="btn-secondary w-full justify-center py-2.5">
            Continue with Facebook
          </button>
        </div>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-surface-200" /></div>
          <div className="relative flex justify-center text-xs"><span className="px-3 bg-[#FAFAFA] text-surface-800">or sign up with email</span></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="input-field" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-field" required />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 8 characters)" className="input-field" required minLength={8} />
          {error && <p className="text-base text-red-500">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 disabled:opacity-60">
            {loading ? "Creating account..." : "Create free account"}
          </button>
        </form>

        {/* Benefits callout */}
        <div className="mt-5 rounded-xl bg-accent-50/60 border border-accent-200/40 p-3.5">
          <p className="text-sm font-bold text-accent-700 mb-2">What you get for free:</p>
          <ul className="space-y-1.5 text-base text-surface-700">
            <li className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-500 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              5 free votes every week
            </li>
            <li className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-500 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              Vote for any pet you love
            </li>
            <li className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-500 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              Every vote helps feed shelter pets
            </li>
            <li className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-accent-500 flex-shrink-0"><path d="M20 6L9 17l-5-5"/></svg>
              Enter your own pet to win prizes (optional)
            </li>
          </ul>
        </div>

        <p className="mt-5 text-center text-base text-surface-800">
          Already have an account? <Link href="/auth/signin" className="text-brand-600 font-bold hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /></div>}>
      <SignUpForm />
    </Suspense>
  );
}

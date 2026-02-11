import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-xl font-bold text-surface-900 mb-2">Something went wrong</h1>
        <p className="text-sm text-surface-500 mb-4">There was an error signing you in.</p>
        <Link href="/auth/signin" className="btn-primary">
          Try again
        </Link>
      </div>
    </div>
  );
}

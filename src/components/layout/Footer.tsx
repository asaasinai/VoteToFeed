import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-surface-900 text-surface-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
          <div className="sm:col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white tracking-tight">Vote to Feed</span>
                <span className="text-[9px] text-surface-500">powered by iHeartDogs &amp; iHeartCats</span>
              </div>
            </div>
            <p className="text-sm leading-relaxed">
              Every vote helps feed shelter pets in need. Join thousands of pet lovers making a difference.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">Contests</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/leaderboard/DOG" className="hover:text-white transition-colors">Dog Contest</Link></li>
              <li><Link href="/leaderboard/CAT" className="hover:text-white transition-colors">Cat Contest</Link></li>
              <li><Link href="/winners" className="hover:text-white transition-colors">Winners</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">Community</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/votesforshelters" className="hover:text-white transition-colors">VotesForShelters</Link></li>
              <li><Link href="/breeds" className="hover:text-white transition-colors">Breed Directory</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">My Pets</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-surface-300 uppercase tracking-wider mb-4">Company</h3>
            <ul className="space-y-2.5 text-sm">
              <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
              <li><Link href="/auth/signin" className="hover:text-white transition-colors">Log in</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-surface-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-surface-500">&copy; {new Date().getFullYear()} Vote to Feed. Powered by iHeartDogs and iHeartCats. All rights reserved.</p>
          <p className="text-xs text-surface-500">Every vote helps feed shelter pets in need.</p>
        </div>
      </div>
    </footer>
  );
}

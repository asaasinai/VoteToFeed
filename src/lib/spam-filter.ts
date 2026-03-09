// Comprehensive profanity blocklist
const PROFANITY_LIST = [
  "fuck", "shit", "ass", "damn", "bitch", "bastard", "crap", "dick", "cock",
  "pussy", "cunt", "whore", "slut", "nigger", "nigga", "faggot", "fag",
  "retard", "retarded", "twat", "wanker", "bollocks", "arse", "piss",
  "tits", "boob", "penis", "vagina", "anal", "blowjob", "handjob",
  "motherfucker", "mofo", "stfu", "gtfo", "wtf", "lmfao", "asshole",
  "dumbass", "jackass", "bullshit", "horseshit", "dipshit", "shitty",
  "fucked", "fucking", "fucker", "fucks", "fck", "fuk", "phuck",
  "sh1t", "a$$", "b1tch", "d1ck", "p1ss", "c0ck",
];

// URL patterns
const URL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /\.[a-z]{2,4}\/\S/i, // .com/something, .net/something
  /bit\.ly/i, /tinyurl/i, /goo\.gl/i, /t\.co/i, // common shorteners
  /\.com\b/i, /\.net\b/i, /\.org\b/i, /\.io\b/i, /\.co\b/i,
  /\.xyz\b/i, /\.info\b/i, /\.biz\b/i, /\.ru\b/i,
];

export type SpamCheckResult = {
  isSpam: boolean;
  reason: "profanity" | "url" | null;
  matchedWords: string[];
};

export function checkForSpam(text: string): SpamCheckResult {
  const lowerText = text.toLowerCase().replace(/[^a-z0-9\s@./:-]/g, "");
  
  // Check profanity
  const matchedProfanity: string[] = [];
  for (const word of PROFANITY_LIST) {
    const pattern = new RegExp(`\\b${word}\\b`, "i");
    if (pattern.test(lowerText) || lowerText.includes(word)) {
      matchedProfanity.push(word);
    }
  }
  if (matchedProfanity.length > 0) {
    return { isSpam: true, reason: "profanity", matchedWords: matchedProfanity };
  }
  
  // Check URLs
  const matchedUrls: string[] = [];
  for (const pattern of URL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      matchedUrls.push(match[0]);
    }
  }
  if (matchedUrls.length > 0) {
    return { isSpam: true, reason: "url", matchedWords: matchedUrls };
  }
  
  return { isSpam: false, reason: null, matchedWords: [] };
}

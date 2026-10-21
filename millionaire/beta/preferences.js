const COMBINATIONS_COOKIE = "daifugo_show_combinations";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readShowCombinations() {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${COMBINATIONS_COOKIE}=`));
  if (!entry) return true;
  return entry.slice(COMBINATIONS_COOKIE.length + 1) === "1";
}

export function saveShowCombinations(enabled) {
  document.cookie = `${COMBINATIONS_COOKIE}=${enabled ? "1" : "0"}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

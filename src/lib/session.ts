const KEY = "office-hub-token";

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

// remember = true keeps the login after the app closes (until it expires).
// Leave it out to keep whichever choice was made at login (for example after a password change).
export function saveToken(token: string | null, remember?: boolean) {
  try {
    const keep = remember ?? localStorage.getItem(KEY) !== null;
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    if (token) (keep ? localStorage : sessionStorage).setItem(KEY, token);
  } catch {
    // storage unavailable: the login just won't survive a reload
  }
}
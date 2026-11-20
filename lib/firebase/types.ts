export type FirebaseAuthErrorCode =
  | "auth/invalid-credential"
  | "auth/email-already-in-use"
  | "auth/weak-password"
  | "auth/invalid-code"
  | "auth/network"
  | "auth/popup-closed"
  | "auth/too-many-requests"
  | "auth/expired-action-code"
  | "auth/backend-unavailable";

/** Human-readable messages for Firebase error codes. Unknown codes fall back to a generic message. */
export const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password combination didn't match our records.",
  "auth/wrong-password": "That email and password combination didn't match our records.",
  "auth/user-not-found": "That email and password combination didn't match our records.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Use at least 8 characters for your password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/network-request-failed": "You appear to be offline. Check your connection.",
  "auth/popup-closed-by-user": "Google sign-in was cancelled.",
  "auth/cancelled-popup-request": "Google sign-in was cancelled.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is invalid or has already been used.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/requires-recent-login": "Please sign in again to continue.",
  "auth/account-exists-with-different-credential": "You already have a Pramaan account with this email. Sign in with your password once — Google will then be linked to it.",
  "auth/unauthorized-domain": "This domain isn't authorised for sign-in. Add it in Firebase Authentication → Settings.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups and try again.",
};

export function authMessage(code: string | undefined): string {
  return (code && AUTH_MESSAGES[code]) || "Something went wrong. Please try again.";
}

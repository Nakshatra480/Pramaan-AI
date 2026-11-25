/** Client-side form checks shown as styled field errors (the server and Firebase still validate). */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export function validateSignIn(v: { email: string; password: string }): FieldErrors<"email" | "password"> {
  const e: FieldErrors<"email" | "password"> = {};
  if (!v.email.trim()) e.email = "Enter your email address.";
  else if (!EMAIL.test(v.email.trim())) e.email = "Enter a valid email address, like you@domain.com.";
  if (!v.password) e.password = "Enter your password.";
  return e;
}

export function validateSignUp(v: { name: string; email: string; password: string }): FieldErrors<"name" | "email" | "password"> {
  const e: FieldErrors<"name" | "email" | "password"> = {};
  if (!v.name.trim()) e.name = "Enter your name.";
  else if (v.name.trim().length > 120) e.name = "Use 120 characters or fewer.";
  const { email } = validateSignIn({ email: v.email, password: "x" });
  if (email) e.email = email;
  if (!v.password) e.password = "Create a password.";
  else if (v.password.length < 8) e.password = "Use at least 8 characters.";
  return e;
}

export const hasErrors = (e: object) => Object.values(e).some(Boolean);

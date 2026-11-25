/** Auth errors surfaced to the UI (shared by the mock and Firebase adapters). */
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

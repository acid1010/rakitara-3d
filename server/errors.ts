export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireState(condition: unknown, message: string): asserts condition {
  if (!condition) throw new HttpError(409, message);
}

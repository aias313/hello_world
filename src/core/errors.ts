import { z } from "zod";

/**
 * A structured, transport-agnostic protocol error. Carries an HTTP-friendly
 * status code and a stable machine code so both the HTTP layer and the MCP
 * layer can surface consistent failures.
 */
export class AdcpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AdcpError";
  }

  toJSON() {
    return {
      error: { code: this.code, message: this.message, details: this.details },
    };
  }

  static notFound(what: string): AdcpError {
    return new AdcpError("not_found", `${what} not found`, 404);
  }

  static invalid(message: string, details?: unknown): AdcpError {
    return new AdcpError("invalid_request", message, 400, details);
  }

  static conflict(message: string): AdcpError {
    return new AdcpError("conflict", message, 409);
  }
}

/** Parse `input` with a Zod schema, raising a well-formed AdcpError on failure. */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  label: string,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AdcpError.invalid(
      `Invalid ${label}`,
      result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  }
  return result.data;
}

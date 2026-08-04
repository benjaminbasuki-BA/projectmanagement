import { ApiError } from "./api-client";

/** Flattens an ApiError's problem+json details into one displayable line. */
export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    return (
      error.problem.errors?.map((e) => e.message).join("; ") ?? error.message
    );
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

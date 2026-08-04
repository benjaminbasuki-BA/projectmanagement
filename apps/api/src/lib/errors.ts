import type { FastifyReply } from "fastify";
import type { z } from "zod";

/**
 * RFC 9457 problem+json shapes, matching the conventions and error
 * catalog in docs/04-api-design.md §4. Shared across modules so every
 * endpoint returns the same shape for the same failure kind.
 */

export function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(422).send({
    type: "https://docs.trellis.app/errors/validation",
    title: "Validation failed",
    status: 422,
    errors: error.issues,
  });
}

/** Cross-tenant/cross-scope access always 404s, never 403 (03 §4). */
export function notFound(reply: FastifyReply) {
  return reply.code(404).send({
    type: "https://docs.trellis.app/errors/not-found",
    title: "Not found",
    status: 404,
  });
}

export function conflict(
  reply: FastifyReply,
  status: 409 | 422,
  slug: string,
  detail: string,
) {
  return reply.code(status).send({
    type: `https://docs.trellis.app/errors/${slug}`,
    title: status === 409 ? "Conflict" : "Unprocessable Entity",
    status,
    detail,
  });
}

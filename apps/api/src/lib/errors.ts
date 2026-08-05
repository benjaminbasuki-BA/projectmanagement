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

/**
 * Insufficient role *within* a tenant the caller is legitimately a
 * member of (e.g. a member hitting an admin-only route) — distinct from
 * `notFound`, which is for cross-tenant access where existence itself
 * must not leak. Here the resource's existence is already known to the
 * caller, so a plain 403 doesn't leak anything.
 */
export function forbidden(reply: FastifyReply, detail: string) {
  return reply.code(403).send({
    type: "https://docs.trellis.app/errors/forbidden",
    title: "Forbidden",
    status: 403,
    detail,
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

/** Single-field validation failure that didn't come from a zod parse
 * (e.g. a field valid a top-level schema but wrong in a deeper,
 * hand-checked way) — same `errors[]` shape as validationError so
 * clients don't need two error formats. */
export function validationErrorDetail(
  reply: FastifyReply,
  field: string,
  message: string,
) {
  return reply.code(422).send({
    type: "https://docs.trellis.app/errors/validation",
    title: "Validation failed",
    status: 422,
    errors: [{ path: [field], message }],
  });
}

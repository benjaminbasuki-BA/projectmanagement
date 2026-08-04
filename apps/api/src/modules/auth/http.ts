import type { FastifyReply } from "fastify";
import type { ZodError } from "zod";

/**
 * RFC 9457 problem responses (docs/04-api-design.md §3). The auth module
 * hand-rolls these because it sits in front of the shared error handler —
 * several of its routes answer before a tenant context exists.
 */

export function validationError(reply: FastifyReply, error: ZodError) {
  return reply.code(422).send({
    type: "https://docs.trellis.app/errors/validation",
    title: "Validation failed",
    status: 422,
    errors: error.issues,
  });
}

export function problem(
  reply: FastifyReply,
  status: number,
  slug: string,
  title: string,
  detail?: string,
) {
  return reply.code(status).send({
    type: `https://docs.trellis.app/errors/${slug}`,
    title,
    status,
    ...(detail ? { detail } : {}),
  });
}

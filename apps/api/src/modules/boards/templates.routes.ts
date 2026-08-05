import type { FastifyPluginAsync } from "fastify";
import { BOARD_TEMPLATES } from "./templates.js";

/**
 * docs/04-api-design.md §2.4: `GET /templates?category=` — browse-only
 * in MVP (doc01 §2.7: custom template saving is V1). Metadata only, not
 * the full groups/columns/items blueprint — that's only needed at
 * instantiation time (POST /workspaces/{id}/boards's `template_id`),
 * not for rendering the gallery.
 */
export const templatesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/templates",
    { preHandler: [app.authenticate, app.requireOrgContext] },
    async (request, reply) => {
      const { category } = request.query as { category?: string };
      const templates = BOARD_TEMPLATES.filter(
        (t) => !category || t.category === category,
      ).map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        description: t.description,
        explainer: t.explainer,
        columnCount: t.columns.length,
        sampleItemCount: t.items.length,
      }));
      return reply.send({ templates });
    },
  );
};

import type { FastifyPluginAsync } from "fastify";
import { itemsRoutes } from "./items.routes.js";
import { commentsRoutes } from "./comments.routes.js";
import { exportRoutes } from "./export.routes.js";
import { importRoutes } from "./import.routes.js";

/**
 * Item-domain routes, matching CLAUDE.md's `items` module boundary:
 * comments live here (not a separate top-level module) since every path
 * in docs/04-api-design.md §2.7 hangs off an item.
 */
export const itemsModuleRoutes: FastifyPluginAsync = async (app) => {
  await app.register(itemsRoutes);
  await app.register(commentsRoutes);
  await app.register(exportRoutes);
  await app.register(importRoutes);
};

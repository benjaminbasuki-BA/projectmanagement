import type { FastifyPluginAsync } from "fastify";
import { boardsRoutes } from "./boards.routes.js";
import { groupsRoutes } from "./groups.routes.js";
import { columnsRoutes } from "./columns.routes.js";
import { viewsRoutes } from "./views.routes.js";
import { activityRoutes } from "./activity.routes.js";

/**
 * Board-domain routes (docs/02-data-model.md §2–§4, §3.2), matching
 * CLAUDE.md's `boards` module boundary: boards, groups, columns, and
 * views all live here rather than as separate top-level modules.
 */
export const boardsModuleRoutes: FastifyPluginAsync = async (app) => {
  await app.register(boardsRoutes);
  await app.register(groupsRoutes);
  await app.register(columnsRoutes);
  await app.register(viewsRoutes);
  await app.register(activityRoutes);
};

export { getAccessibleBoard, getAccessibleWorkspace } from "./access.js";

export { default as authPlugin } from "./plugin.js";
export { authRoutes } from "./routes.js";
export { passwordResetRoutes } from "./password-reset.js";
export { twoFactorRoutes } from "./two-factor.js";
export { googleOAuthRoutes } from "./oauth-google.js";
export { setActiveOrg } from "./sessions.js";
export type { AuthenticatedSession } from "./sessions.js";

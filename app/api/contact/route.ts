// Disabled TypeScript route. Frontend posts directly to Power Automate webhook.
// Re-export JS implementation to avoid duplicate logic if this file is imported.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export { POST } from './route.js';

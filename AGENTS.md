# Repository Guidelines

## Project Structure & Module Organization
- `app/` hosts the Next.js App Router code. Pages (e.g., `app/page.js`) define client components, while `app/api/` is reserved for HTTP handlers.
- Global styles live in `app/globals.css`. Static assets and SEO files sit in `public/`.
- `main.py` contains the standalone Pygame prototype; keep it isolated from the web app but feel free to mirror shared constants via small JSON files in the repo root.
- Configuration lives at the root: `next.config.js`, `jsconfig.json` (aliasing), and `package.json`.

## Build, Test, and Development Commands
Use npm scripts at the repository root:
- `npm run dev` — launches the Next.js dev server with hot reload.
- `npm run build` — compiles the production bundle; run before deployment.
- `npm run start` — serves the output of `next build`.
- `npm run lint` — executes `next lint` (ESLint + Next rules) on `app/` and config files.
- `python main.py` — optional: run the Pygame demo locally.

## Coding Style & Naming Conventions
- Follow the default ESLint + `eslint-config-next` rules; run `npm run lint` before pushing.
- Use 4-space indentation (matches current React components and Python script).
- Name React components in PascalCase and match file names where possible; route folders use kebab-case (`future-industries`).
- Keep CSS variables and custom properties in `app/globals.css`; co-locate component-specific styles via CSS Modules if added later.

## Testing Guidelines
- No automated tests exist yet. When adding them, prefer Next.js + Jest (`next/jest`) with files in `__tests__/` mirroring the component path (`app/components/Card.test.jsx`).
- Target meaningful interaction coverage for hooks and forms; smoke-test API routes with supertest or fetch mocks.
- Always run the full suite with `npm test` (add a script that wraps Jest) before requesting review.

## Commit & Pull Request Guidelines
- Recent history uses short, imperative commits (`resend`, `initial push`). Continue using concise verbs plus context (`add hero metrics`, `fix lint errors`).
- For pull requests, include: purpose summary, key changes, testing evidence (`npm run lint` output or screenshots), and linked issue numbers.
- UI changes should attach before/after captures; backend or API tweaks should highlight new endpoints or payload changes.

## Security & Configuration Tips
- Environment secrets for mail providers (e.g., Resend) belong in `.env.local`, never in git. Document required keys in the PR description.
- Run `npm run lint` in CI or pre-push hooks to catch obvious errors before deploying to production hosting.

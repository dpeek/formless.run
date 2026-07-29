# Formless Renderer Agents

Package scope: `@dpeek/formless-renderer`.

Read this when editing `lib/renderer/*`.

## Owns

- Formless Renderer presentation for application and public Site surfaces.
- Application and Site assembly, providers, StyleX presentation, and CSS entries.
- Concrete renderers and fixtures backed by Astryx components and tokens.
- Standalone Vite fixture explorer and package-local build configuration.

## Does Not Own

- Formless runtime storage, schema parsing, projections, route policy, effects, or
  write planning.
- Renderer-neutral Presentation contracts, references, intents, Presentation
  Hosts, or React host adapters.
- Renderer-neutral Site contracts, public form sessions, or Site runtime behavior.
- Canonical product specs.

## Map

- `package.json`: documented package subpaths, scripts, and dependencies.
- `vite.config.ts`: fixture-explorer Vite config.
- `tsconfig.json`: package-local TypeScript project.
- `index.html`: Vite HTML entrypoint.
- `src/application-*`: production application renderer, provider, and CSS.
- `src/site-*`: production public Site renderers and provider.
- `src/components/`: application, generated-field, management, auth, access, and
  Site presentation.
- `src/global.css`: public Site reset, neutral theme, and Site token overrides.
- `src/main.tsx`, `src/root.tsx`: fixture-explorer entry and layout catalog.

## Read Path

1. Read this file.
2. Read the relevant exported contract, provider, assembly, or renderer.
3. Read focused `src/components/*` implementation and tests.
4. Read the matching CSS entry or fixture-explorer files only when changing them.

## Rules

- Use **Formless Renderer** for product behavior and **Astryx** only for concrete
  package, component, token, StyleX, CSS, or source facts.
- Use the Presentation package's concise surface contract and generic host
  vocabulary directly.
- Consume contracts and hosts through documented Presentation package subpaths.
- Consume projected contract facts and dispatch canonical intents. Do not read app
  records, parse schema, execute operations, or plan writes in renderer code.
- Use Astryx components for layout and controls.
- Keep custom styling out unless needed; prefer component props first.
- If custom styling is needed, use StyleX with Astryx tokens.
- Do not add app schema, runtime storage, or generated UI behavior here.
- Keep fixture layouts focused on real product behavior and representative contract
  states. Avoid migration proof UI and prototype cruft.
- UI labels, icons, colors, states, disabled reasons, primary actions, hidden
  behavior, and semantic affordances must come from passed contract data, concrete
  Astryx component behavior, or an explicit product requirement.
- Do not start a separate package dev server during normal agent work.

## Test Rules

- Own mapping complete Presentation contracts to user-visible DOM,
  accessibility semantics, controlled state, and exact canonical intent
  dispatch.
- Exercise production renderers with real Astryx and adjacent production
  renderer leaves. Do not module-mock Renderer components.
- Do not independently test fixture catalogs or reducers, private data
  attributes, exact Astryx variants, Astryx behavior, source text, exact
  dependency versions, implementation history, or removed behavior.

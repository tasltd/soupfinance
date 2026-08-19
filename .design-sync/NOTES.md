# design-sync notes — soupfinance-web

Working notes for the claude.ai/design sync. Everything a future run would otherwise
re-derive. Tags: `[GENERAL]` = not specific to this repo, expect it elsewhere.

Project: **SoupFinance Design System** — `b5d29df3-3792-4a20-a6d8-7d048a5f0795`
(pinned in `config.json`; never create a second project for this repo).

---

## 1. Shape

`shape: "storybook"` — 14 components, 124 stories, in `soupfinance-web/src/components/`
(`forms/`, `feedback/`, `layout/`). The storybook is the fidelity oracle; the shipped
bundle is compiled from `soupfinance-web/ds-entry.ts`.

`soupfinance-web` is an **app, not a published library** — there is no `dist/` entry and no
`src/components/index.ts` barrel. `ds-entry.ts` is the design-system surface, written for
this sync: the storied components plus `Logo`, `LanguageSwitcher`, the zustand stores, and
the i18n language list. Feature screens, API clients and route trees stay out — they are
the app, not the design system.

## 2. No `@/*` path alias here

Unlike most React repos, this one imports **relatively** — `tsconfig.app.json` declares no
`paths`, and `vite.config.ts` declares no alias. So the `tsconfig` comment-stripping bug
that bites `@/*` repos (see the soupmarkets-web/sparx notes) does not apply, and no
`tsconfig.dssync.json` is needed. **If someone adds an alias later, this changes** — the
bundler's tsconfig reader strips `/* … */` with a naive regex, and the `/*` inside the JSON
string `"@/*"` opens a comment that eats the rest of `paths`. The fix is a paths-only,
comment-free `tsconfig.dssync.json` pointed at by `cfg.tsconfig`.

## 3. `react-router-dom` must be an extraEntry

The layout components (`SideNav`, `MainLayout`, `AuthLayout`) use `NavLink` / `Outlet` /
`useLocation`, and their stories wrap them in `MemoryRouter`. Without
`extraEntries: ["react-router-dom"]` the story's router and the shipped component's router
are **two different module instances**, so the component sees no router context and throws.
The entry makes react-router-dom's exports part of `window.SoupFinance`, and the preview
compiler then redirects the story's import to it — one instance, shared context.

## 4. `storyImports.shim` for the zustand stores — the non-obvious one

`SideNav`, `TopNav` and `MainLayout` read `useUIStore` / `useAuthStore` / `useAccountStore`,
and the stories drive them by **calling the setters** (`useUIStore.setState(...)`) before
rendering. Preview-compile rule 3 bundles any non-component import from source, so
`../../stores` would compile a **second copy of every store** into the preview: the story
would set state on one instance while the shipped component read another, and every story
would render its default state.

Two halves, both required:
- `ds-entry.ts` re-exports `./src/stores`, so the hooks exist on `window.SoupFinance`.
- `cfg.storyImports.shim: ["/src/stores/"]` forces any import resolving into that directory
  to the bundle global instead of being bundled from source.

**If a new shared singleton appears (a context, an event bus, another store), it needs the
same treatment** — the symptom is a story whose setup visibly has no effect.

## 5. Fonts — the app uses Google Fonts over the network; the sync self-hosts them

`src/index.css` starts with two `@import url('https://fonts.googleapis.com/...')` lines:
**Manrope** (the only typeface) and **Material Symbols Outlined** (the icon font, used in
16 component files). Those remote imports survive into `_ds_bundle.css`, but a design canvas
that cannot reach `fonts.googleapis.com` would render every icon as its literal word
("dashboard", "receipt_long") — a loud, ugly failure.

So the fonts are vendored: `.design-sync/fonts/` holds the 7 woff2 files, and
`.design-sync/fonts-src.css` is the `@font-face` sheet pointing at them, wired in via
`cfg.extraFonts`. The converter copies them to `ds-bundle/fonts/` and rewrites the urls.

**Trap:** `url()` in that sheet is resolved **relative to the sheet**, not to the woff2
directory. The sheet lives at `.design-sync/fonts-src.css` and the files at
`.design-sync/fonts/`, so every url must read `./fonts/<file>.woff2`. Getting this wrong
produces `[FONT_DANGLING]` at validate: the `@font-face` rules ship but no font file does.

To refresh (new weight, new icon set), re-fetch the Google CSS with a **desktop browser
User-Agent** (Google serves ttf to unknown agents), save the woff2 into `.design-sync/fonts/`,
and rewrite the urls to `./fonts/<file>`.

## 6. `[GENERAL]` Three config paths, three different bases

This costs a round-trip every time. In `config.json`:

| Field | Resolved from |
|---|---|
| `entry`, `storybookStatic`, `storybookConfigDir` | the **cwd** the converter runs in (repo root) |
| `srcDir`, `tsconfig`, `extraFonts`, `guidelinesGlob` | the **package dir** (`soupfinance-web/`) |
| `readmeHeader` | the **config's home** (repo root) |

Hence `extraFonts: ["../.design-sync/fonts-src.css"]` and
`guidelinesGlob: ["../.claude/rules/soupfinance-design-system.md"]` — both need `../` to
climb out of `soupfinance-web/` — while `readmeHeader: ".design-sync/conventions.md"` does
not. A wrong base is a soft `! … not found — skipped` line, not an error: **read the build
log for it**, or the guidelines and README header silently never ship.

## 7. The logo was a broken image in every preview — fixed in app source

`Logo.tsx` rendered `<img src="/logo.png">`, a **root-absolute** path served out of
`public/`. That resolves only while this app is serving the page: in the design bundle it
404s, so `SideNav`, `TopNav`, `MainLayout` and `AuthLayout` all showed a broken-image icon
where the brand belongs.

Fixed by importing the asset instead: `public/logo.png` was copied to `src/assets/logo.png`
and `Logo.tsx` now does `import logoMark from '../assets/logo.png'`. Vite emits a hashed URL
for the app; the design bundler inlines it as a data URL (its `.png` loader is `dataurl`),
so the mark travels with the bundle. Behaviour in the app is unchanged and `public/logo.png`
is left in place for anything else referencing it.

**`[GENERAL]`: any root-absolute asset path in a design-system component is broken by
construction outside its own app.** Import the asset; don't reference the web root.

## 8. Two SideNav stories are broken **in the repo's own storybook** — skipped, not worked around

`SideNav.stories.tsx` has a meta-level decorator that wraps every story in `StoryWrapper`
(which supplies a `MemoryRouter`), and `DarkMode` / `CollapsedDarkMode` add their **own**
decorator that wraps in `StoryWrapper` **again**. Storybook composes story decorators with
meta decorators rather than replacing them, so those two stories nest two routers and throw
`You cannot render a <Router> inside another <Router>`.

Compare confirms it from the reference side (`sb-error` ×2) — this is the repo's bug, not a
sync artifact, and it is live in their storybook today. Handled with

```json
"SideNav": { "skip": ["layout-sidenav--dark-mode", "layout-sidenav--collapsed-dark-mode"] }
```

which drops them from the card as well as from grading. Dark-mode SideNav is still
represented — `MainLayout`'s `DarkMode` and `DarkModeCollapsed` stories render it.

**The real fix, if anyone wants those two stories back:** in each story's decorator, drop
the `StoryWrapper` wrapper and keep only the `document.documentElement.classList.add('dark')`
effect plus the store setters — the meta decorator already supplies the router. Then remove
the `skip` entry and rebuild.

## 9. Card layout overrides

`MainLayout`, `SideNav` and `TopNav` are full-width chrome; their stories render far wider
than a grid cell, so validate raised `[GRID_OVERFLOW]`. All three are
`"cardMode": "column"` (full card width per story, every story kept) with an explicit
`primaryStory`. The form and feedback components are grid-friendly and need no override.

## 10. Expected warnings — do not "fix" these

- **`! preview decorator bundle failed: Could not resolve "tailwindcss"`** — the converter
  tries to bundle `.storybook/preview.ts` as a preview wrapper; that file imports
  `src/index.css`, which is Tailwind v4 CSS-first (`@import "tailwindcss"`), and esbuild
  cannot resolve it. Harmless **here** because this repo's preview declares **no
  decorators** — only `parameters` — so there is no context to lose. Do **not** set
  `cfg.provider` to silence it: that would replace a wrapper that never existed.
- **`[CSS_FROM_STORYBOOK]`** — there is no separate DS stylesheet to bundle, so component
  CSS is lifted from the reference storybook's compiled Tailwind output. That is the
  intended path for a Tailwind-v4 app, and it is what `styles.css` `@import`s.
- **`[REFERENCE_STALE?]`** after a config-only change — the bundle rehashes but the
  storybook did not need rebuilding. Only act on it when **component source** changed.

## 11. Standing commands

Run from the repo root (`soupmarkets/soupfinance`):

```bash
# reference storybook — rebuild ONLY when component or story source changes
npx --prefix soupfinance-web storybook build -c soupfinance-web/.storybook \
  -o "$(git rev-parse --show-toplevel)/.design-sync/sb-reference"

# convert + verify
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules soupfinance-web/node_modules --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle          # positional arg, NOT --out
node .ds-sync/storybook/compare.mjs --out ./ds-bundle \
  --storybook-static .design-sync/sb-reference --max-stories 12

# re-sync driver (build → diff → validate → scoped capture)
node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules soupfinance-web/node_modules --out ./ds-bundle
```

`--max-stories 12` is **required, not optional**: the default cap of 6 leaves roughly half
the stories uncaptured while they still ship in the cards. The longest component here has
12 stories.

`.ds-sync/` and `ds-bundle/` are gitignored and regenerated; re-stage `.ds-sync/` from the
skill on a fresh clone.

## 12. Re-sync risks — check these first next time

- **A new `@/*` alias** in tsconfig or vite (§2) — silently breaks module resolution.
- **A new shared store/context** that stories drive by setter (§4) — needs the shim.
- **A new Google Font or icon weight** in `index.css` (§5) — vendor it or designs lose it.
- **A new root-absolute asset path** in a component (§7) — broken image in every design.
- **Those two SideNav stories** (§8) — if someone fixes the nested decorator, drop the skip.
- **New components** land as cards only once they have stories; `src/components/charts/` and
  `src/components/tables/` are empty directories today.

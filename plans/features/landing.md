# Feature: Landing Site (www.soupfinance.com)

**Reviewed**: 2026-10-06 (main @ f80bf22 / 083a461) · **TASCIM module**: Landing Site (`3e594de9-…`)

## 1. Overview

A static HTML marketing site. It has no login and no SPA code; links only point to `https://app.soupfinance.com` (see `.claude/rules/soupfinance-domain-architecture.md`).

| Area | Path |
|------|------|
| Pages | `soupfinance-landing/index.html`, `privacy-policy.html`, `terms-of-service.html`, `cookie-policy.html`, `acceptable-use-policy.html`, `sitemap.xml`, `robots.txt` |
| Assets | `logo.png/svg`, `favicon.*`, `apple-touch-icon.png`, `screenshots/*.png` |
| Styling | Tailwind **Play CDN** (`cdn.tailwindcss.com`) with inline `tailwind.config` on every page |
| Vhost | `soupfinance-landing/deploy/www-soupfinance-com.conf` (canonical) plus a duplicate `apache-www-soupfinance.conf` (identical today) |
| Deploy | `soupfinance-landing/deploy-landing.sh` (unsafe; see SOUPFIN-214) |
| Tests | `soupfinance-web/src/test/landingTailwindConfig.test.ts`, `e2e/landing-page.spec.ts`, `e2e/soupfin-90-landing-palette.spec.ts`; `e2e/soupfin-93-landing-hero-phone.spec.ts` (branch only) |

## 2. Current status

**Works on main**
- The palette loads again (SOUPFIN-90, db1da1c: `tailwind.config`, `from-white/[0.98]`).
- Legal pages exist. Sign-in and register links go to app.soupfinance.com.

**Broken / missing**
- Deploy has not been confirmed for SOUPFIN-90, and `deploy-landing.sh` cannot be used safely:
  - it runs `systemctl restart apache2`;
  - it can `systemctl stop apache2` for certbot standalone;
  - it overwrites the vhost on every deploy;
  - it never uploads `logo.png`, the favicons or `apple-touch-icon.png`.
- `/site.webmanifest` is linked but missing.
- The hero subtitle overlaps the photo on phones. The fix is on an unmerged branch (SOUPFIN-93). The orange accent is below 3:1 contrast on phones (SOUPFIN-96). The nav CTA covers the wordmark at 320px (SOUPFIN-97).
- **Pricing copy is wrong for the product decision.** SoupFinance is **free until the end of 2027**, with no tiers or plans. The page still talks about a "free trial", "Beta Testing & Trial Mode", and "Starter / Professional / Enterprise plans" (FAQ JSON-LD). It also keeps a hidden `#pricing-hidden` plan table, and its meta description claims "Trusted by 2,500+ teams". If the site mentions pricing at all, it must say "free until end of 2027" and nothing else.
- The Play CDN is not production-grade: in-browser compile and a console warning. Config typos fail silently, which is exactly how SOUPFIN-90 happened.
- Stray validation scripts and PNG reports clutter the landing root.

## 3. Task review

| ID | Title | State | Evidence / notes |
|----|-------|-------|------------------|
| SOUPFIN-90 | Custom colours never load (invisible CTA) | In Progress → **In Review** | db1da1c (#56) on main + tests. Needs a safe deploy and a live check |
| SOUPFIN-93 | Hero subtitle overlaps photo on phones | In Review (unchanged) | Fix 2141e9a only on branch `…soupfin-93-issue-landing`; main index.html:291 unchanged |
| SOUPFIN-96 | Orange accent < 3:1 on phones | Backlog (unchanged) | After SOUPFIN-93; brand decision |
| SOUPFIN-97 | Nav button covers wordmark at 320px | Backlog → **Todo** | No commits; index.html:269-273 unchanged |
| SOUPFIN-214 | Safe content-only deploy script (+ webmanifest) | new → Todo (high) | Blocks shipping 90/93 |
| SOUPFIN-215 | Copy: free until end of 2027; drop trial/plan wording and unverified claims | new → Todo | Scope change 2026-10-06 |
| SOUPFIN-216 | Replace Tailwind Play CDN with a built CSS | new → Backlog | |

## 4. Remaining work plan

1. **Make deploys safe.** Rewrite `deploy-landing.sh` as content-only, with optional configtest + reload, no restart, no certbot, all assets included, and one vhost file. Closes SOUPFIN-214.
2. **Merge the pending visual fix.** Open a PR for the SOUPFIN-93 branch, merge it, then fix SOUPFIN-97 (shrink-0 / nowrap / shorter label at 320px).
3. **Correct the pricing message.** Replace the pricing and beta section with a single "Free until the end of 2027" block, delete `#pricing-hidden`, rename CTAs to "Get started free", update JSON-LD (Offer price 0, priceValidUntil 2027-12-31; FAQ), and remove unsubstantiated claims. Closes SOUPFIN-215.
4. **Deploy and verify.** Run the new script. Verify that `<title>`, the CTA colour, the hero at 375px and `/logo.png` all return 200. This closes SOUPFIN-90 and SOUPFIN-93.
5. **Accessibility follow-up.** Decide the accent colour below lg and raise `MIN_ACCENT_CONTRAST` to 3 (SOUPFIN-96).
6. **Hardening.** Add a Tailwind CLI build in place of the CDN and move the validation scripts out of the landing root (SOUPFIN-216; clutter cleanup is part of SOUPFIN-215).

## 5. Backend dependencies

None. The site is static. The only server work is the Apache vhost on 65.20.112.224, which must use configtest + reload, never restart.

## 6. Related QBO-parity / COA tasks

None apply directly. With no pricing tiers, the landing site must not present plan comparisons. QBO-parity features can be added to the features section as they ship.

## 7. Definition of done

- `deploy-landing.sh` deploys content safely and repeatably: no Apache restart or stop, all referenced assets present, no 404s in the browser console.
- www.soupfinance.com shows the correct palette, readable hero text at 320/375/768, and no overlap at 320px. The accent contrast decision is recorded.
- Pricing, where it appears, says only that SoupFinance is free until the end of 2027. No trial, tier or plan wording remains in the HTML or JSON-LD.
- The landing specs (`landing-page`, `soupfin-90`, `soupfin-93`) pass in Firefox.

// SDK version constant — kept in sync with package.json at build time.
//
// Why hardcoded here (not read from package.json at runtime):
//   - Same value regardless of install method (npm or github URL).
//   - No runtime require of package.json (Rollup/Webpack friendly).
//   - Available in tree-shaken browser bundles.
//
// Update on every release:
//   1. Bump package.json `version`
//   2. Update SDK_VERSION below to match
//   3. Commit + tag + push
//
// Future: replace with build-time injection via a tsc transformer if the
// manual sync becomes a chore (it hasn't).

export const SDK_VERSION = "0.4.3";

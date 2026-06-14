// Public verification interface for @gamerplex/sdk consumers.
//
// Third-party integrators implementing custom games for the Gamerplex Arcade
// can implement the Validator interface below. The resolver dispatches to
// registered validators server-side; this SDK only exposes the contract.
//
// NOTE: built-in game validators (blockwords/chess/snake/flipball/pet-legends)
// live in the resolver, not here, to keep this package minimal for integrators.

export type { ReplayInput, Validator, Verdict } from "./types";
export { verdictFail, verdictOk } from "./types";

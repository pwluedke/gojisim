/**
 * Test-only engine hooks: the M3d code registry for fixture abilities, test ability data for
 * fixture cards, and `custom` effect handlers. Not part of the main `@gojisim/engine` entry.
 */
export {
  type AbilityDefinition,
  getAbility,
  registerAbility,
  type TriggerContext,
  unregisterAbility,
} from "./abilities";
export {
  type Context,
  registerCustomEffect,
  setTestAbilities,
} from "./interpreter";

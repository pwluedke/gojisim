import { ENGINE_DEPENDENCIES, ENGINE_PACKAGE } from "@gojisim/engine";

export const BOT_PACKAGE = "@gojisim/bot";

export const BOT_DEPENDENCIES: readonly string[] = [
  ENGINE_PACKAGE,
  ...ENGINE_DEPENDENCIES,
];

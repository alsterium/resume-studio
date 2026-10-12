import { mergeConfig, defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig({ command: "serve", mode: "test" }),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["tests/setup.ts"],
      include: ["tests/{integration,unit}/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  }),
);

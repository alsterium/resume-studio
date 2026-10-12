import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "web"
      ? [
          {
            name: "web-entry",
            transformIndexHtml: {
              order: "pre" as const,
              handler: (html: string) => html.replace("/src/main.tsx", "/src/web-main.tsx"),
            },
          },
        ]
      : []),
  ],
  build: { outDir: mode === "web" ? "dist-web" : "dist" },
  publicDir: mode === "web" ? "public-web" : "public",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: mode === "web" ? 1421 : 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**", "**/tasks/**"] },
  },
}));

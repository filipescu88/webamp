import { defineConfig } from "vite";
import nodePolyfills from "rollup-plugin-polyfill-node";

export default defineConfig({
  // Relative asset paths, so the same build works both under the project page
  // URL (filipescu88.github.io/webamp/) and at the root of a custom domain
  // (win-amp.pl). An absolute "/webamp/" would 404 on the custom domain.
  base: "./",
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2500,
  },
  assetsInclude: ["**/*.wsz", "**/*.mp3"],
  plugins: [
    // Needed for music-metadata-browser which uses polyfillable node APIs
    // @ts-expect-error Rollup plugin type mismatch with Vite's stricter types
    nodePolyfills(),
  ],
});

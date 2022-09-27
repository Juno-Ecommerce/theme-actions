const { dirname } = require("path");
const { fdir } = require("fdir");
const esbuild = require("esbuild");

const actionEntries = new fdir()
  .withFullPaths()
  .withMaxDepth(1)
  .glob("**/index.ts")
  .crawl("./.github/actions/")
  .sync();

for (const actionEntry of actionEntries) {
  esbuild
    .build({
      bundle: true,
      entryPoints: [actionEntry],
      minify: true,
      outfile: dirname(actionEntry) + "/index.min.js",
      platform: "node",
      target: "node16",
    })
    .catch(() => process.exit(1));
}

import * as exec from "@actions/exec";
import * as core from "@actions/core";
import fs from "fs";
import os from "os";
import path from "path";
import diff from "microdiff";

async function runAction() {
  if (!process.env.THEME_ROOT)
    throw new Error("Missing [THEME_ROOT] environment variable");

  if (!process.env.BUILD_MANIFEST)
    throw new Error("Missing [BUILD_MANIFEST] environment variable");

  const manifestFile = process.env.BUILD_MANIFEST;
  const themeRoot = process.env.THEME_ROOT;

  step("Download previous build manifest file");
  let result = "{}";
  try {
    const tmpDir = path.join(os.tmpdir(), "theme-deploy");
    await exec.exec(`shopify theme pull ${tmpDir}`, [
      `--theme=${process.env.SHOPIFY_THEME_ID}`,
      `--only=${manifestFile}`,
    ]);
    result = fs.readFileSync(path.join(tmpDir, manifestFile), "utf-8");
  } catch (error) {
    core.warning(error);
  }
  const previousBuildManifest = JSON.parse(result);

  step("Calculate diff");
  const currentBuildManifest = JSON.parse(
    fs.readFileSync(path.join(themeRoot, manifestFile), "utf-8")
  );

  const changedDiff = diff(previousBuildManifest, currentBuildManifest);

  if (changedDiff.length === 0) {
    core.notice(`No file changes detected for this store`);
    return;
  }

  const filesToUpload = changedDiff
    .filter(({ type }) => ["CHANGE", "CREATE"].includes(type))
    .map(({ path: [file] }) => file)
    .concat([manifestFile]);

  if (filesToUpload.length) {
    step("Upload files");
    await exec.exec(`shopify theme push ${themeRoot}`, [
      "--allow-live",
      "--nodelete",
      `--theme=${process.env.SHOPIFY_THEME_ID}`,
      ...filesToUpload.map((f) => `--only=${f}`),
    ]);
  }

  const filesToRemove = changedDiff
    .filter(({ type }) => type === "REMOVE")
    .map(({ path: [file] }) => file);

  if (filesToRemove.length) {
    step("Remove files");
    const { default: PQueue } = await import("p-queue");
    const { default: fetch } = await import("node-fetch");
    const queue = new PQueue({ concurrency: 2 });

    const removeAsset = (asset) =>
      fetch(
        `https://${process.env.SHOPIFY_SHOP}/admin/api/2023-01/themes/${process.env.SHOPIFY_THEME_ID}/assets.json?asset[key]=${asset}`,
        {
          method: "DELETE",
          headers: {
            "User-Agent": "Shopify Theme Action",
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": process.env.SHOPIFY_PASSWORD,
          },
        }
      );
    let count = 0;
    const total = filesToRemove.length;
    queue.on("next", () => {
      console.log(`${count + 1}/${total} | Deleting [${filesToRemove[count]}]`);
      count++;
    });

    for (const file of filesToRemove) {
      queue.add(() => removeAsset(file));
    }

    await queue.onIdle();
  }
}

function step(name) {
  core.info(
    `\n==============================\n${name}\n==============================\n`
  );
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

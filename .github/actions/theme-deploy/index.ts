import * as exec from "@actions/exec";
import * as core from "@actions/core";
import fs from "fs";
import os from "os";
import path from "path";
import diff from "microdiff";
import { logStep, removeAssets } from "../../../lib/utils";

async function runAction() {
  if (!process.env.THEME_ROOT)
    throw new Error("Missing [THEME_ROOT] environment variable");

  if (!process.env.BUILD_MANIFEST)
    throw new Error("Missing [BUILD_MANIFEST] environment variable");

  const manifestFile = process.env.BUILD_MANIFEST;
  const themeRoot = process.env.THEME_ROOT;

  logStep("Download previous build manifest file");
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

  logStep("Calculate diff");
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
    logStep("Upload files");
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
    logStep("Remove files");
    await removeAssets({
      shop: process.env.SHOPIFY_SHOP,
      password: process.env.SHOPIFY_PASSWORD,
      themeId: process.env.SHOPIFY_THEME_ID,
      files: filesToRemove,
    });
  }
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as exec from "@actions/exec";
import {
  createTheme,
  getStoreThemes,
  logStep,
  createGitHubComment,
} from "../../../lib/utils";

async function runAction() {
  if (!process.env.SHOPIFY_FLAG_PATH)
    throw new Error("Missing [SHOPIFY_FLAG_PATH] environment variable");
  if (!process.env.SHOPIFY_FLAG_STORE)
    throw new Error("Missing [SHOPIFY_FLAG_STORE] environment variable");
  if (!process.env.SHOPIFY_CLI_THEME_TOKEN)
    throw new Error("Missing [SHOPIFY_CLI_THEME_TOKEN] environment variable");

  const themeName = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;
  const themeRoot = process.env.SHOPIFY_FLAG_PATH;

  logStep("Check if preview theme already exists");
  const allThemes = await getStoreThemes({
    shop: process.env.SHOPIFY_FLAG_STORE,
    password: process.env.SHOPIFY_CLI_THEME_TOKEN,
  });

  console.log({ allThemes });

  let previewTheme = allThemes.find((t) => t.name === themeName);

  const ignoredFilesFlags = (process.env.IGNORED_FILES || "")
    .trim()
    .split("\n")
    .map((pattern) => `--ignore=${pattern}`);

  console.log({ ignoredFilesFlags });

  if (!previewTheme) {
    logStep("Preview theme not found, creating new theme");
    previewTheme = await createTheme({
      shop: process.env.SHOPIFY_FLAG_STORE,
      password: process.env.SHOPIFY_CLI_THEME_TOKEN,
      themeName,
    });

    const tmpRoot = "dist-live-theme";
    const restoreKey = "live-theme-cache";
    const cacheKey = `${restoreKey}-${new Date().toISOString().slice(0, 7)}`;
    const cacheHit = await cache.restoreCache([tmpRoot], cacheKey, [
      restoreKey,
    ]);

    await exec.exec(`shopify theme pull`, [
      "--live",
      `--path=${tmpRoot}`,
      ...ignoredFilesFlags,
    ]);
    if (!cacheHit) await cache.saveCache([tmpRoot], cacheKey);
    await exec.exec(`shopify theme push`, [
      `--path=${tmpRoot}`,
      `--theme=${previewTheme.id}`,
      ...ignoredFilesFlags,
    ]);
  }

  logStep("Update preview theme");
  await exec.exec(`shopify theme push`, [
    `--nodelete`,
    `--theme=${previewTheme.id}`,
    ...ignoredFilesFlags,
  ]);

  logStep("Create github comment");
  await createGitHubComment(previewTheme);
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

import { resolve } from "node:path";
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

  const themeName = `Juno/Preview - ${process.env.GITHUB_HEAD_REF}`;

  logStep("Check if preview theme already exists");
  const allThemes = await getStoreThemes({
    shop: process.env.SHOPIFY_FLAG_STORE,
    password: process.env.SHOPIFY_CLI_THEME_TOKEN,
  });

  let previewTheme = allThemes.find((t) => t.name === themeName);
  let ignoredFilesFlags =
    core
      .getInput("IGNORED_FILES")
      .split("\n")
      .map((pattern) => `--ignore=${pattern}`) ?? [];

  core.debug(
    JSON.stringify({
      ignoredFiles: {
        ignoredFiles: core.getInput("IGNORED_FILES"),
        ignoredPatterns: ignoredFilesFlags,
      },
    })
  );

  if (!previewTheme) {
    logStep("Preview theme not found, creating new theme");
    previewTheme = await createTheme({
      shop: process.env.SHOPIFY_FLAG_STORE,
      password: process.env.SHOPIFY_CLI_THEME_TOKEN,
      themeName,
    });

    const tmpRoot = resolve(
      process.env.SHOPIFY_FLAG_PATH,
      "../dist-live-theme"
    );
    const restoreKey = "live-theme-cache-";
    const cacheKey = `${restoreKey}${new Date().toISOString().slice(0, 7)}`;
    const cacheHit = await cache.restoreCache([tmpRoot], cacheKey, [
      restoreKey,
    ]);
    core.debug(JSON.stringify({ cacheHit }));
    core.debug(
      JSON.stringify({
        "pnpm shopify theme pull": [
          "--live",
          "--only=config/settings_data.json",
          "--only=locales/*.json",
          "--only=sections/*",
          "--only=templates/*.json",
          `--path=${tmpRoot}`,
        ],
      })
    );
    await exec.exec(`pnpm shopify theme pull`, [
      "--live",
      "--only=config/settings_data.json",
      "--only=locales/*.json",
      "--only=sections/*",
      "--only=templates/*.json",
      `--path=${tmpRoot}`,
    ]);
    if (!cacheHit) await cache.saveCache([tmpRoot], cacheKey);
    core.debug(
      JSON.stringify({
        "pnpm shopify theme push": [
          "--nodelete",
          `--path=${tmpRoot}`,
          `--theme=${previewTheme.id}`,
        ],
      })
    );
    await exec.exec(`pnpm shopify theme push`, [
      "--nodelete",
      `--path=${tmpRoot}`,
      `--theme=${previewTheme.id}`,
    ]);
  }

  logStep("Update preview theme");
  core.debug(
    JSON.stringify({
      "pnpm shopify theme push": [
        `--nodelete`,
        `--theme=${previewTheme.id}`,
        ...ignoredFilesFlags,
      ],
    })
  );
  await exec.exec(`pnpm shopify theme push`, [
    `--nodelete`,
    `--theme=${previewTheme.id}`,
    ...ignoredFilesFlags,
  ]);

  logStep("Create github comment");
  await createGitHubComment(previewTheme.id);
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

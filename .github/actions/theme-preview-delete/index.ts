import * as core from "@actions/core";
import { deleteTheme, getStoreThemes, logStep } from "../../../lib/utils";

async function runAction() {
  const themeName = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;

  logStep("Retrieve preview theme id");
  const allThemes = await getStoreThemes({
    shop: process.env.SHOPIFY_SHOP,
    password: process.env.SHOPIFY_PASSWORD,
  });

  const previewTheme = allThemes.find((t) => t.name === themeName);

  if (!previewTheme) {
    core.notice(`Preview theme [${themeName}] not found. Skipping.`);
    return;
  }

  logStep("Deleting preview theme");
  await deleteTheme({
    shop: process.env.SHOPIFY_SHOP,
    password: process.env.SHOPIFY_PASSWORD,
    themeId: previewTheme.id,
  });
  core.info(`Preview theme [${themeName}] has been deleted`);
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

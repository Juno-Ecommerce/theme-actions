import * as core from "@actions/core";

import fetch from "node-fetch";

const themeName = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;
const apiURL = `https://${process.env.SHOPIFY_SHOP}/admin/api/2023-01`;
const requestHeaders = {
  "User-Agent": "Shopify Theme Action",
  "Content-Type": "application/json",
  "X-Shopify-Access-Token": process.env.SHOPIFY_PASSWORD,
};

async function runAction() {
  step("Retrieve preview theme id");
  const { themes } = await fetch(`${apiURL}/themes.json`, {
    headers: requestHeaders,
  }).then((response) => response.json());

  const previewTheme = themes.find((t) => t.name.includes(themeName));
  if (!previewTheme) {
    core.notice(`Preview theme [${themeName}] not found. Skipping.`);
    return;
  }

  step("Deleting preview theme");
  await fetch(`${apiURL}/themes/${previewTheme.id}.json`, {
    method: "DELETE",
    headers: requestHeaders,
  });
  core.info(`Preview theme [${themeName}] has been deleted`);
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

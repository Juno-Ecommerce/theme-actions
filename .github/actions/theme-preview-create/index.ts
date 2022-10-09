import * as core from "@actions/core";
import * as cache from "@actions/cache";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import { createTheme, getStoreThemes, logStep } from "../../../lib/utils";

async function runAction() {
  if (!process.env.THEME_ROOT)
    throw new Error("Missing [THEME_ROOT] environment variable");
  if (!process.env.SHOPIFY_SHOP)
    throw new Error("Missing [SHOPIFY_SHOP] environment variable");
  if (!process.env.SHOPIFY_PASSWORD)
    throw new Error("Missing [SHOPIFY_PASSWORD] environment variable");

  const themeName = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;
  const themeRoot = process.env.THEME_ROOT;

  logStep("Check if preview theme already exists");
  const allThemes = await getStoreThemes({
    shop: process.env.SHOPIFY_SHOP,
    password: process.env.SHOPIFY_PASSWORD,
  });

  let previewTheme = allThemes.find((t) => t.name === themeName);

  const ignoredFilesFlags = (process.env.IGNORED_FILES || "")
    .trim()
    .split("\n")
    .map((pattern) => `--ignore=${pattern}`);

  if (!previewTheme) {
    logStep("Preview theme not found, creating new theme");
    previewTheme = await createTheme({
      shop: process.env.SHOPIFY_SHOP,
      password: process.env.SHOPIFY_PASSWORD,
      themeName,
    });

    const tmpRoot = "dist-live-theme";
    const restoreKey = "live-theme-cache";
    const cacheKey = `${restoreKey}-${new Date().toISOString().slice(0, 7)}`;
    const cacheHit = await cache.restoreCache([tmpRoot], cacheKey, [
      restoreKey,
    ]);

    await exec.exec(`shopify theme pull ${tmpRoot}`, [
      "--live",
      ...ignoredFilesFlags,
    ]);
    if (!cacheHit) await cache.saveCache([tmpRoot], cacheKey);
    await exec.exec(`shopify theme push ${tmpRoot}`, [
      `--theme=${previewTheme.id}`,
      ...ignoredFilesFlags,
    ]);
  }

  logStep("Update preview theme");
  await exec.exec(`shopify theme push ${themeRoot}`, [
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

async function createGitHubComment(themeId) {
  const prID = github.context.payload.pull_request?.number;
  if (!prID) {
    throw new Error("Unable to find PR");
  }

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("Missing {GITHUB_TOKEN} environment variable");
  }

  // TODO: Preview specific for current store?

  const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
  const commentIdentifier =
    "<!-- Comment by Shopify Theme Deploy Previews Action -->";
  let commentID;

  findCommentId: {
    core.debug(`[DEBUG] - Searching for comment`);
    const { data: listOfComments } = await octokit.rest.issues.listComments({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      issue_number: prID,
    });
    commentID = listOfComments.find((comment) =>
      comment.body?.includes(commentIdentifier)
    )?.id;
    if (commentID) core.debug(`[DEBUG] - Found comment with ID: ${commentID}`);
    else core.debug(`[DEBUG] - Comment not found`);
  }

  if (!commentID) {
    try {
      core.debug(`[DEBUG] - Adding comment to PR`);
      await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: prID,
        body: `${commentIdentifier}\n🚀 Preview deployed successfully!\nPlease add the below urls to your Jira ticket, for the PM to review.\n

${"```"}
Theme preview:
https://${process.env.SHOPIFY_SHOP}/?preview_theme_id=${themeId}

Customize this theme in the Theme Editor
https://${process.env.SHOPIFY_SHOP}/admin/themes/${themeId}/editor`,
      });
      core.debug(`[DEBUG] - Comment added successfully`);
    } catch (error) {
      core.debug(`[DEBUG] - Error while adding comment`);
      core.setFailed(error.message);
    }
  }
}

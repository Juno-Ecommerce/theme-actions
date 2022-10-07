import core from "@actions/core";
import cache from "@actions/cache";
import exec from "@actions/exec";
import github from "@actions/github";
import fetch from "node-fetch";

if (!process.env.THEME_ROOT)
  throw new Error("Missing [THEME_ROOT] environment variable");

(async () => {
  const themeName = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;
  const themeRoot = process.env.THEME_ROOT;

  // TODO: Ignore files flag  -x, --ignore
  // TODO: Better check?
  try {
    step("Update preview theme");
    await exec.exec(
      `shopify theme push ${themeRoot} --nodelete --theme="${themeName}"`,
      undefined,
      { failOnStdErr: true }
    );
    return;
  } catch {
    core.notice("Preview theme doesn't exist, creating.");
  }

  step("Download live theme");
  const restoreKey = "live-theme-cache";
  const cacheKey = `${restoreKey}-${new Date().toISOString().split("T")[0]}`;
  const cacheHit = await cache.restoreCache([themeRoot], cacheKey, [
    restoreKey,
  ]);
  await exec.exec(`shopify theme pull ${themeRoot} --live`);
  if (!cacheHit) await cache.saveCache([themeRoot], cacheKey);

  step("Production build");
  await exec.exec(`pnpm run webpack:build`);

  step("Create preview theme");
  const themeData = await fetch(
    `https://${process.env.SHOPIFY_SHOP}/admin/api/2023-01/themes.json`,
    {
      method: "POST",
      headers: {
        "User-Agent": "Shopify Theme Action",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_PASSWORD,
      },
      body: JSON.stringify({
        theme: {
          name: themeName,
          role: "development",
        },
      }),
    }
  ).then((response) => response.json());

  step("Update preview theme");
  await exec.exec(
    `shopify theme push ${themeRoot} --nodelete --theme="${themeName}"`
  );

  step("Create github comment");
  await createGitHubComment(themeData.id);
})();

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

\`\`\`
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

import { fdir, type PathsOutput } from "fdir";
import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { themeKit } from "../../../lib/themekit";

const SHOPIFY_PASSWORD = core.getInput("SHOPIFY_PASSWORD", { required: true });
const SHOPIFY_STORE = core.getInput("SHOPIFY_STORE", { required: true });
const ACTION = core.getInput("ACTION", { required: true });
const SHOPIFY_API_VERSION = "2022-10";
const SHOPIFY_API_URL = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}`;

if (!process.env.WORK_DIR)
  throw new Error("Missing {WORK_DIR} environment variable");
if (!process.env.BUILD_DIR)
  throw new Error("Missing {BUILD_DIR} environment variable");

const BUILD_DIR = path.join(process.env.WORK_DIR, process.env.BUILD_DIR);
const PREVIEW_THEME_NAME = `Juno/${process.env.GITHUB_HEAD_REF} - Preview`;

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

async function runAction() {
  const themeList = await getThemeList();
  let previewTheme = themeList.find(({ name }) =>
    name.includes(PREVIEW_THEME_NAME)
  );
  core.debug(
    "[DEBUG] - Preview theme data: " + previewTheme
      ? JSON.stringify(previewTheme)
      : "null"
  );

  if (ACTION === "CREATE_PREVIEW") {
    if (!previewTheme) {
      previewTheme = await duplicateLiveTheme();
    }

    deployPR: {
      const ignoredFiles = [
        ...(core.getInput("IGNORED_FILES")
          ? core.getInput("IGNORED_FILES").split(" ")
          : []),
      ];
      await themeKit("deploy", {
        dir: BUILD_DIR,
        env: "Preview Work",
        ignoredFiles,
        nodelete: true,
        password: SHOPIFY_PASSWORD,
        store: SHOPIFY_STORE,
        themeId: previewTheme.id,
      });
      core.info("Deployed updates from this PR");
    }

    await createGitHubComment(previewTheme.id);
    return;
  }
  if (ACTION === "REMOVE_PREVIEW") {
    if (previewTheme) {
      await deletePreviewTheme(previewTheme.id);
    }
    return;
  }
  throw new Error(`Unknown action - ${ACTION}`);
}

// ---

async function getThemeList() {
  const data = (await fetch(`${SHOPIFY_API_URL}/themes.json`, {
    headers: {
      "User-Agent": "Shopify Theme Action",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_PASSWORD,
    },
  }).then((response) => response.json())) as any;
  return data.themes;
}

async function duplicateLiveTheme() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "juno-theme-preview"));
  core.debug(`[DEBUG] - Created temporary directory: ${tmpDir}`);
  const previewThemePromise = createPreviewTheme();
  try {
    await themeKit("download", {
      dir: tmpDir,
      ignoredFiles: ["assets/**.*"],
      live: true,
      password: SHOPIFY_PASSWORD,
      store: SHOPIFY_STORE,
    });
  } catch (error) {
    core.error("[ERROR] - Unable to download live theme.");
  }
  const previewTheme = await previewThemePromise;
  core.debug(
    `[DEBUG] - Created preview theme: ${JSON.stringify(previewTheme)}`
  );
  const [themeFiles, templateFiles] = (
    new fdir().withRelativePaths().crawl(tmpDir).sync() as PathsOutput
  ).reduce(
    (acc, curr) => {
      acc[+!!curr.startsWith("templates")].push(curr);
      return acc;
    },
    [[], []] as any
  );
  await themeKit("deploy", {
    dir: tmpDir,
    files: themeFiles,
    password: SHOPIFY_PASSWORD,
    store: SHOPIFY_STORE,
    themeId: previewTheme.id,
  });
  await themeKit("deploy", {
    dir: tmpDir,
    files: templateFiles,
    password: SHOPIFY_PASSWORD,
    store: SHOPIFY_STORE,
    themeId: previewTheme.id,
  });
  return previewTheme;
}

async function createPreviewTheme() {
  const { theme } = (await fetch(`${SHOPIFY_API_URL}/themes.json`, {
    method: "POST",
    headers: {
      "User-Agent": "Shopify Theme Action",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_PASSWORD,
    },
    body: JSON.stringify({
      theme: {
        name: PREVIEW_THEME_NAME,
        role: "development",
      },
    }),
  }).then((response) => response.json())) as any;
  return theme;
}

async function deletePreviewTheme(themeId) {
  await fetch(`${SHOPIFY_API_URL}/themes/${themeId}.json`, {
    method: "DELETE",
    headers: {
      "User-Agent": "Shopify Theme Action",
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_PASSWORD,
    },
  });
  core.info("Deleted preview theme");
}

async function createGitHubComment(themeId) {
  const prID = github.context.payload.pull_request?.number;
  if (!prID) {
    throw new Error("Unable to find PR");
  }

  if (!process.env.GITHUB_TOKEN) {
    throw new Error("Missing {GITHUB_TOKEN} environment variable");
  }

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
https://${SHOPIFY_STORE}/?preview_theme_id=${themeId}

Customize this theme in the Theme Editor
https://${SHOPIFY_STORE}/admin/themes/${themeId}/editor`,
      });
      core.debug(`[DEBUG] - Comment added successfully`);
    } catch (error) {
      core.debug(`[DEBUG] - Error while adding comment`);
      core.setFailed(error.message);
    }
  }
}

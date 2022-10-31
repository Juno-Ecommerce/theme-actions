import * as github from "@actions/github";
import * as core from "@actions/core";
import PQueue from "p-queue";
import { Client, request } from "undici";

type Theme = {
  created_at: string;
  id: number;
  name: string;
  previewable: boolean;
  processing: boolean;
  role: "main" | "unpublished" | "demo" | "development";
  theme_store_id: number | null;
  updated_at: string;
};

const BASE_URL = `https://theme-kit-access.shopifyapps.com`;
const API_VERSION = "2023-01";

export async function getStoreThemes(props: {
  shop: string;
  password: string;
}) {
  const { body } = await request(
    `${BASE_URL}/cli/admin/api/${API_VERSION}/themes.json`,
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": props.password,
        "X-Shopify-Shop": props.shop,
      },
    }
  );

  const { themes } = (await body.json()) as { themes: Theme[] };

  return themes;
}

export async function createTheme(props: {
  shop: string;
  password: string;
  themeName: string;
  role?: "unpublished" | "development";
}) {
  const { body } = await request(
    `${BASE_URL}/cli/admin/api/${API_VERSION}/themes.json`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": props.password,
        "X-Shopify-Shop": props.shop,
      },
      body: JSON.stringify({
        theme: {
          name: props.themeName,
          role: props.role ?? "development",
        },
      }),
    }
  );

  const theme = (await body.json()) as Theme;

  return theme;
}

export async function deleteTheme(props: {
  shop: string;
  password: string;
  themeId: string;
}) {
  const { body } = await request(
    `${BASE_URL}/cli/admin/api/${API_VERSION}/themes/${props.themeId}.json`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": props.password,
        "X-Shopify-Shop": props.shop,
      },
    }
  );

  const theme = (await body.json()) as Theme;

  return theme;
}

export async function removeAssets(props: {
  shop: string;
  password: string;
  themeId: number | string;
  files: string[];
}) {
  const queue = new PQueue({ concurrency: 2 });
  const client = new Client(BASE_URL, {
    pipelining: 2,
  });

  logQueueProgress: {
    let count = 0;
    queue.on("next", () => {
      console.log(
        `${count + 1}/${props.files.length} | Deleting [${props.files[count]}]`
      );
      count++;
    });
  }

  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": props.password,
    "X-Shopify-Shop": props.shop,
  };
  for (const file of props.files) {
    queue.add(() =>
      client.request({
        path: `/cli/admin/api/${API_VERSION}/themes/${props.themeId}/assets.json?asset[key]=${file}`,
        method: "DELETE",
        headers,
      })
    );
  }

  await queue.onIdle();
  await client.close();
}

export function logStep(name: string) {
  core.info(
    `\n==============================\n${name}\n==============================\n`
  );
}

export async function createGitHubComment(themeId) {
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
https://${process.env.SHOPIFY_FLAG_STORE}/?preview_theme_id=${themeId}

Customize this theme in the Theme Editor
https://${process.env.SHOPIFY_FLAG_STORE}/admin/themes/${themeId}/editor`,
      });
      core.debug(`[DEBUG] - Comment added successfully`);
    } catch (error) {
      core.debug(`[DEBUG] - Error while adding comment`);
      core.setFailed(error.message);
    }
  }
}

import * as core from "@actions/core";
import PQueue from "p-queue";
import fetch from "node-fetch";

type Theme = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  role: "main" | "unpublished" | "demo" | "development";
  theme_store_id: null;
  previewable: true;
  processing: false;
  admin_graphql_api_id: "gid://shopify/Theme/752253240";
};

const API_VERSION = "2023-01";

export async function getStoreThemes(props: {
  shop: string;
  password: string;
}) {
  const response = await fetch(
    `https://${props.shop}/admin/api/${API_VERSION}/themes.json`,
    {
      headers: {
        "User-Agent": "Juno Theme Action",
        "X-Shopify-Access-Token": props.password,
      },
    }
  );

  const { themes } = (await response.json()) as { themes: Theme[] };

  return themes;
}

export async function createTheme(props: {
  shop: string;
  password: string;
  themeName: string;
  role?: "unpublished" | "development";
}) {
  const response = await fetch(
    `https://${props.shop}/admin/api/${API_VERSION}/themes.json`,
    {
      method: "POST",
      headers: {
        "User-Agent": "Juno Theme Action",
        "X-Shopify-Access-Token": props.password,
      },
      body: JSON.stringify({
        theme: {
          name: props.themeName,
          role: props.role ?? "development",
        },
      }),
    }
  );

  const theme = await response.json();

  return theme as Theme;
}

export async function deleteTheme(props: {
  shop: string;
  password: string;
  themeId: string;
}) {
  const response = await fetch(
    `https://${props.shop}/admin/api/${API_VERSION}/themes/${props.themeId}.json`,
    {
      method: "DELETE",
      headers: {
        "User-Agent": "Juno Theme Action",
        "X-Shopify-Access-Token": props.password,
      },
    }
  );
  const theme = await response.json();

  return theme;
}

export async function removeAssets(props: {
  shop: string;
  password: string;
  themeId: number;
  files: string[];
}) {
  const request = (asset: string) =>
    fetch(
      `https://${props.shop}/admin/api/2023-01/themes/${props.themeId}/assets.json?asset[key]=${asset}`,
      {
        method: "DELETE",
        headers: {
          "User-Agent": "Juno Theme Action",
          "X-Shopify-Access-Token": props.password,
        },
      }
    );

  const queue = new PQueue({ concurrency: 2 });

  let count = 0;
  queue.on("next", () => {
    console.log(
      `${count + 1}/${props.files.length} | Deleting [${props.files[count]}]`
    );
    count++;
  });

  for (const file of props.files) {
    queue.add(() => request(file));
  }

  await queue.onIdle();
}

export function logStep(name: string) {
  core.info(
    `\n==============================\n${name}\n==============================\n`
  );
}

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

const API_VERSION = "2023-01";

export async function getStoreThemes(props: {
  shop: string;
  password: string;
}) {
  const { body } = await request(
    `https://${props.shop}/admin/api/${API_VERSION}/themes.json`,
    {
      headers: {
        "User-Agent": "Juno Theme Action",
        "X-Shopify-Access-Token": props.password,
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

  const theme = (await body.json()) as Theme;

  return theme;
}

export async function deleteTheme(props: {
  shop: string;
  password: string;
  themeId: string;
}) {
  const { body } = await request(
    `https://${props.shop}/admin/api/${API_VERSION}/themes/${props.themeId}.json`,
    {
      method: "DELETE",
      headers: {
        "User-Agent": "Juno Theme Action",
        "X-Shopify-Access-Token": props.password,
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
  const client = new Client(`https://${props.shop}`, {
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

  for (const file of props.files) {
    queue.add(() =>
      client.request({
        path: `/admin/api/${API_VERSION}/themes/${props.themeId}/assets.json?asset[key]=${file}`,
        method: "DELETE",
        headers: {
          "User-Agent": "Juno Theme Action",
          "X-Shopify-Access-Token": props.password,
        },
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

import { command as themeKit } from "@shopify/themekit";
import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import diff from "microdiff";
import install from "@shopify/themekit/lib/install";

const SHOPIFY_PASSWORD = core.getInput("SHOPIFY_PASSWORD", { required: true });
const SHOPIFY_STORE = core.getInput("SHOPIFY_STORE", { required: true });
const SHOPIFY_THEME_ID = core.getInput("SHOPIFY_THEME_ID", { required: true });

if (!process.env.WORK_DIR) throw new Error("Missing {WORK_DIR} environment variable");
if (!process.env.BUILD_DIR) throw new Error("Missing {BUILD_DIR} environment variable");

const BUILD_DIR = path.join(process.env.WORK_DIR, process.env.BUILD_DIR);
const BUILD_MANIFEST = core.getInput("BUILD_MANIFEST");

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

async function runAction() {
  await install("silent");

  // TODO: Should we store the build manifest in Cache and only fallback to themekit when not available?
  const previousBuild = await getPreviousBuildData();
  const buildOutputHash = JSON.parse(
    BUILD_MANIFEST ? fs.readFileSync(path.join(BUILD_DIR, BUILD_MANIFEST), "utf-8") : "{}"
  );

  const changedDiff = diff(previousBuild, buildOutputHash);

  if (changedDiff.length === 0) {
    core.debug(`No file changes detected for this store`);
    return;
  }

  const filesToUpload = changedDiff
    .filter(({ type }) => ["CHANGE", "CREATE"].includes(type))
    .map(({ path: [file] }) => file as string)
    .concat([BUILD_MANIFEST]);

  if (filesToUpload.length) {
    core.debug(`Started uploading new files`);
    await themeKitPerformAction("deploy", {
      files: filesToUpload,
    });
    core.debug(`Finished uploading files`);
  }

  const filesToRemove = changedDiff
    .filter(({ type }) => type === "REMOVE")
    .map(({ path: [file] }) => file as string);

  if (filesToRemove.length) {
    core.debug(`Started removing files`);
    await themeKitPerformAction("remove", {
      files: filesToRemove,
    });
    core.debug(`Finished removing files`);
  }
}

// ---

async function getPreviousBuildData() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "theme-deploy"));
  let result = "{}";

  try {
    await themeKitPerformAction("download", {
      files: [BUILD_MANIFEST],
      dir: tmpDir,
    });
    result = fs.readFileSync(path.join(tmpDir, BUILD_MANIFEST), "utf-8");
  } catch (error) {
    core.warning(error);
  }

  return JSON.parse(result);
}

function themeKitPerformAction(
  action: "remove" | "deploy" | "download",
  flags: {
    dir?: string;
    files: string[];
  }
) {
  if (!flags.files?.length) {
    core.debug(`Skipped themekit action, no files provided`);
    return Promise.resolve();
  }
  return themeKit(
    action,
    {
      allowLive: true,
      dir: BUILD_DIR,
      password: SHOPIFY_PASSWORD,
      store: SHOPIFY_STORE,
      themeId: SHOPIFY_THEME_ID,
      ...flags,
    },
    { logLevel: "silent" }
  );
}

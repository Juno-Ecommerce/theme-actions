import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { BinWrapper } from "@mole-inc/bin-wrapper";

if (!process.env.WORK_DIR)
  throw new Error("Missing {WORK_DIR} environment variable");

const config = {
  baseURL: "https://shopify-themekit.s3.amazonaws.com",
  version: "1.3.0",
  destination: path.join(process.env.WORK_DIR, "bin"),
  binName: "theme",
  binSource: () => {
    const urlAndPath = `${config.baseURL}/v${config.version}`;
    return process.platform === "darwin"
      ? `${urlAndPath}/darwin-amd64/theme`
      : process.platform === "linux"
      ? process.arch === "x64"
        ? `${urlAndPath}/linux-amd64/theme`
        : `${urlAndPath}/linux-386/theme`
      : "";
  },
};

/** Installs the Theme Kit executable into the bin/ subdirectory. */
async function downloadThemeKit() {
  core.info("[Theme Kit] - Installation starting");

  const installer = new BinWrapper()
    .src(config.binSource(), process.platform)
    .dest(config.destination)
    .use(config.binName);

  try {
    await installer.run(["version"]);
  } catch (err) {
    throw new Error(err);
  }

  core.info(`[Theme Kit] - Installation complete`);
}

/**
 * Runs a ThemeKit command with the runExecutable utility.
 * Forces the --no-update-notifier flag to prevent update messages from
 * appearing when `theme update` can't be run via CLI for this package.
 * @param {string} cmd        Theme Kit command to run
 * @param {Object} flagObj    flags for the Theme Kit command
 * @param {Object } options    additional options (cwd and logLevel)
 */
export const themeKit = (
  cmd,
  flagObj = {},
  options = { cwd: process.cwd() }
) => {
  const updatedFlagObj = { ...flagObj, noUpdateNotifier: true };
  const flagArr = getFlagArrayFromObject(updatedFlagObj);

  return runExecutable([cmd, ...flagArr], options.cwd);
};

/**
 * Converts an object of obj[key] = value pairings into an
 * array that the Theme Kit executable can understand.
 * @param {Object} obj
 */
function getFlagArrayFromObject(obj) {
  return Object.keys(obj).reduce((arr, key) => {
    const flag = `--${key.toLowerCase()}`;
    if (key === "noUpdateNotifier" && typeof obj[key] === "boolean") {
      return obj[key] ? [...arr, "--no-update-notifier"] : arr;
    } else if (key === "noIgnore" && typeof obj[key] === "boolean") {
      return obj[key] ? [...arr, "--no-ignore"] : arr;
    } else if (key === "allowLive" && typeof obj[key] === "boolean") {
      return obj[key] ? [...arr, "--allow-live"] : arr;
    } else if (typeof obj[key] === "boolean") {
      return obj[key] ? [...arr, flag] : arr;
    } else if (key === "ignoredFile") {
      return [...arr, "--ignored-file", obj[key]];
    } else if (key === "ignoredFiles") {
      const ignoredFiles = obj[key].reduce(
        (files, file) => [...files, "--ignored-file", file],
        []
      );
      return [...arr, ...ignoredFiles];
    } else if (key === "files") {
      return [...arr, ...obj[key]];
    } else {
      return [...arr, flag, obj[key]];
    }
  }, []);
}

/**
 * Spawns a child process to run the Theme Kit executable with given parameters
 * @param {string[]}  args      array to pass to the executable
 * @param {string}    cwd       directory to run command on
 */
async function runExecutable(args, cwd) {
  core.info("[Theme Kit] - Command starting");

  const pathToExecutable = path.join(config.destination, config.binName);

  if (!fs.existsSync(pathToExecutable)) await downloadThemeKit();

  await exec.exec(pathToExecutable, args, {
    cwd,
    failOnStdErr: true,
    listeners: {
      stderr: (data: Buffer) => {
        core.error(data.toString("utf8"));
      },
    },
  });

  core.info("[Theme Kit] - Command finished");
}

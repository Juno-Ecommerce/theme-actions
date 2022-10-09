import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { logStep } from "../../../lib/utils";

async function runAction() {
  logStep("Configuring shopify CLI");

  await exec.exec(`mkdir -p ~/.config/shopify && cat <<-YAML > ~/.config/shopify/config
  [analytics]
  enabled = false
  YAML`);

  const timeout = setTimeout(() => {
    throw new Error("[shopify login] command took longer than 30s");
  }, 30 * 1000);
  await exec.exec("shopify login");
  clearTimeout(timeout);
}

// Execute

try {
  runAction();
} catch (error) {
  core.setFailed(error);
}

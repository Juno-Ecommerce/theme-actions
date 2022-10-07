import core from "@actions/core";
import exec from "@actions/exec";

async function runAction() {
  step("Configuring shopify CLI");

  await exec.exec(`mkdir -p ~/.config/shopify && cat <<-YAML > ~/.config/shopify/config
  [analytics]
  enabled = false
  YAML`);

  const timeout = setTimeout(() => {
    throw new Error("[shopify login] command took too longer than 10s");
  }, 10 * 1000);
  await exec.exec("shopify login");
  clearTimeout(timeout);
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

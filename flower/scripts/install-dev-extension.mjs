import { installDevelopmentExtension } from "./cep-dev-extension.mjs";

try {
  await installDevelopmentExtension();
} catch (error) {
  console.error("[ERROR] " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}

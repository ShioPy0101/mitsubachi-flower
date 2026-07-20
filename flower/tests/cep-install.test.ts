import assert from "node:assert/strict";
import { mkdir, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";


async function loadInstaller(): Promise<any> {
  const specifier = pathToFileURL(path.resolve(process.cwd(), "scripts", "cep-dev-extension.mjs")).href;
  return new Function("specifier", "return import(specifier)")(specifier);
}

async function tempDir(name: string): Promise<string> {
  const dir = path.join(os.tmpdir(), name + "-" + process.pid + "-" + Math.random().toString(16).slice(2));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  return dir;
}

async function makeExtensionRoot(options: { manifest?: boolean; main?: boolean; script?: boolean } = {}): Promise<string> {
  const root = await tempDir("flower-cep-root");
  if (options.manifest !== false) {
    await mkdir(path.join(root, "CSXS"), { recursive: true });
    await writeFile(path.join(root, "CSXS", "manifest.xml"), '<ExtensionManifest><MainPath>./panel/index.html</MainPath><ScriptPath>./jsx/flower.jsx</ScriptPath></ExtensionManifest>', "utf8");
  }
  if (options.main !== false) {
    await mkdir(path.join(root, "panel"), { recursive: true });
    await writeFile(path.join(root, "panel", "index.html"), "ok", "utf8");
  }
  if (options.script !== false) {
    await mkdir(path.join(root, "jsx"), { recursive: true });
    await writeFile(path.join(root, "jsx", "flower.jsx"), "ok", "utf8");
  }
  return root;
}

const silentLogger = { log() {} };

test("validateExtensionRoot succeeds for CEP root layout", async () => {
  const root = await makeExtensionRoot();
  const { validateExtensionRoot } = await loadInstaller();
  const result = await validateExtensionRoot(root);
  assert.equal(result.manifestPath, path.join(root, "CSXS", "manifest.xml"));
  assert.equal(result.mainPathResolved, path.join(root, "panel", "index.html"));
  assert.equal(result.scriptPathResolved, path.join(root, "jsx", "flower.jsx"));
});

test("validateExtensionRoot fails when CSXS manifest is missing", async () => {
  const root = await makeExtensionRoot({ manifest: false });
  const { validateExtensionRoot } = await loadInstaller();
  await assert.rejects(() => validateExtensionRoot(root), /manifest missing/);
});

test("validateExtensionRoot fails when MainPath target is missing", async () => {
  const root = await makeExtensionRoot({ main: false });
  const { validateExtensionRoot } = await loadInstaller();
  await assert.rejects(() => validateExtensionRoot(root), /MainPath target missing/);
});

test("validateExtensionRoot fails when ScriptPath target is missing", async () => {
  const root = await makeExtensionRoot({ script: false });
  const { validateExtensionRoot } = await loadInstaller();
  await assert.rejects(() => validateExtensionRoot(root), /ScriptPath target missing/);
});

test("installDevelopmentExtension recreates an existing junction", async () => {
  const targetRoot = await tempDir("flower-cep-target");
  const firstRoot = await makeExtensionRoot();
  const secondRoot = await makeExtensionRoot();
  const { installDevelopmentExtension } = await loadInstaller();
  await installDevelopmentExtension({ extensionRoot: firstRoot, targetRoot, logger: silentLogger });
  await installDevelopmentExtension({ extensionRoot: secondRoot, targetRoot, logger: silentLogger });
  const linkTarget = await readlink(path.join(targetRoot, "mitsubachi-flower"));
  assert.equal(path.resolve(linkTarget), path.resolve(secondRoot));
});

test("installDevelopmentExtension refuses to remove a normal directory", async () => {
  const targetRoot = await tempDir("flower-cep-target");
  const root = await makeExtensionRoot();
  await mkdir(path.join(targetRoot, "mitsubachi-flower"));
  const { installDevelopmentExtension } = await loadInstaller();
  await assert.rejects(() => installDevelopmentExtension({ extensionRoot: root, targetRoot, logger: silentLogger }), /Refusing to remove non-link path/);
});





// pre-render script for extensions marketplace
// requires quarto on the server
// transforms manifests in the repository so that once deployed
// the listing page will link to an extension with a supported runtime on the server
// this could also enable filtering out extensions for which the server does not have a supporting runtime

import { TarStream, type TarStreamInput } from "@std/tar/tar-stream";
import { format, greaterThan, parse } from "@std/semver";

function listExtensionSubdirectories(extensionPath: string) {
  const extensions = Deno.readDirSync(extensionPath);
  const subdirs = Array.from(extensions).filter((x) => x.isDirectory);
  const validSubdirs = subdirs.filter((subdir) => {
    const subdirPath = `${extensionPath}/${subdir.name}`;
    const files = Array.from(Deno.readDirSync(subdirPath)).map((file) =>
      file.name
    );
    return files.includes("connect-extension.toml") &&
      files.includes("manifest.json");
  });
  const valid = validSubdirs.map((x) => x.name);
  return valid;
}

function parseManifest(subdir: string) {
  const manifestPath = `${subdir}/manifest.json`;
  const manifest = Deno.readTextFileSync(manifestPath);
  return JSON.parse(manifest);
}

async function getServerRuntimeVersions(
  connectServer = Deno.env.get("CONNECT_SERVER"),
  connectApiKey = Deno.env.get("CONNECT_API_KEY"),
  runtime: string = "python",
) {
  const req = await fetch(
    `${connectServer}/__api__/v1/server_settings/${runtime}`,
    { headers: { "Authorization": `Key ${connectApiKey}` } },
  );

  const res = await req.json();
  const versions = res.installations.map((x) => x.version);
  return versions;
}

function rewriteManifest(manifest, availableVersions: string[]) {
  const getMaxServerVersion = availableVersions.map(parse).reduce((a, b) => {
    return greaterThan(a, b) ? a : b;
  });
  const maxServerVersion = format(getMaxServerVersion);
  manifest.python.version = maxServerVersion
  return manifest;
}

async function createTarball(extName: string, manifest) {
  const files: TarStreamInput[] = [];

  const tmpManifest = new TextEncoder().encode(JSON.stringify(manifest))
  files.push({
    type: "file",
    path: "manifest.json",
    size: tmpManifest.byteLength,
    readable: ReadableStream.from([tmpManifest])
  })

  for (const [filename, _fileInfo] of Object.entries(manifest.files)) {
    const fileStats = await Deno.stat(`${extName}/${filename}`);
    const fileHandle = await Deno.open(`${extName}/${filename}`);

    files.push({
      type: "file",
      path: filename,
      size: fileStats.size,
      readable: fileHandle.readable,
    });
  }

  const outfile = await Deno.create(`./${extName}.tar.gz`);

  await ReadableStream.from(files)
    .pipeThrough(new TarStream())
    .pipeThrough(new CompressionStream("gzip"))
    .pipeTo(outfile.writable);
}

async function main() {
  const extensionPath = ".";
  const extensionsList = listExtensionSubdirectories(extensionPath);
  const manifests = extensionsList.map((subdir) => parseManifest(subdir));
  const serverPythonVersions = await getServerRuntimeVersions();
  const updatedManifests = manifests.map((manifest) =>
    rewriteManifest(manifest, serverPythonVersions)
  );
  await Promise.all(
    extensionsList.map(async (extName, i) => {
      await createTarball(extName, updatedManifests[i]);
    }),
  );
}

main();

#! /usr/bin/env bun

import { input, select } from "@inquirer/prompts";
import consola from "consola";
import { Octokit } from "octokit";
import { $, semver, type ShellOutput } from "bun";
import { colors } from "consola/utils";
import { mkdir, readdir } from "node:fs/promises";
import path from "path";
import {
   CARGO_TOML_PATH,
   DEBUG_BUILDS_PATH,
   PACKAGE_JSON_PATH,
   RELEASE_BUILDS_PATH,
   REPO,
   TAURI_DEBUG_BUILD_PATH,
   TAURI_RELEASE_BUILD_PATH,
   getBuildFiles,
   getPatchedVersion,
   getVersions,
   stringToVersion,
   versionToString,
   writeCargoTomlVersion,
   writePackageJsonVersion,
} from "./utils";
import { BuildType, type AppVersion } from "./types";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

consola.log("");
const intent = await select({
   message: "Select an action:",
   choices: [
      { name: "Build", value: 0 },
      { name: "Create Release", value: 1 },
      { name: "Delete Release", value: 2 },
   ],
});

if (intent === 0) {
   const version = await input({ message: `Enter the desired version ${colors.red("without patch number")}:` });
   const debugOrRelease = await select({
      message: "Select a build mode:",
      choices: [
         { name: "Release", value: BuildType.RELEASE },
         { name: "Debug", value: BuildType.DEBUG },
      ],
   });

   await buildVersion(version, debugOrRelease, false);
} else if (intent === 1) {
   const debugVersions = await getVersions(BuildType.DEBUG);
   const releaseVersions = await getVersions(BuildType.RELEASE);

   const versions = [...releaseVersions, ...debugVersions];

   const version = await select({
      message: "Select the version to publish:",
      choices: versions.map((v) => ({
         name: `${versionToString(v.version)} ${getVersionTypeText(v.type)}`,
         value: v,
      })),
   });

   const description = await input({
      message: "Enter a description:",
   });

   await createGithubRelease(version.type, versionToString(version.version), description);
   // await logVersions();
} else if (intent === 2) {
   const releases = await octokit.rest.repos.listReleases({ repo: REPO, owner: "WerdoxDev" });

   const versions: (AppVersion & { id: number; tag: string })[] = releases.data.map((x) => ({
      type: x.tag_name.includes("-dev") ? BuildType.DEBUG : BuildType.RELEASE,
      version: stringToVersion(x.tag_name.slice(1, 6)),
      id: x.id,
      tag: x.tag_name,
   }));

   const release = await select({
      message: "Select a release to delete:",
      choices: versions.map((v) => ({ name: `${versionToString(v.version)} ${getVersionTypeText(v.type)}`, value: v })),
   });

   await octokit.rest.repos.deleteRelease({ owner: "WerdoxDev", repo: REPO, release_id: release.id });
   await octokit.rest.git.deleteRef({ owner: "WerdoxDev", repo: REPO, ref: `tags/${release.tag}` });

   consola.log("");
   consola.success(
      `Successfuly deleted release for version ${colors.cyan(versionToString(release.version))} ${getVersionTypeText(release.type)}`
   );
}

async function buildVersion(version: string, type: BuildType, disablePublishing: boolean) {
   try {
      const versions = await getVersions(type);
      const newVersion = getPatchedVersion(version, versions);
      const newVersionPath = path.resolve(type === BuildType.DEBUG ? DEBUG_BUILDS_PATH : RELEASE_BUILDS_PATH, newVersion);

      consola.log("");
      consola.info(`Started build for version ${colors.cyan(newVersion)} ${getVersionTypeText(type)}`);
      consola.info(`Updating version fields to ${colors.cyan(newVersion)}`);

      // Update the version numbers in cargo.toml and package.json
      await writeCargoTomlVersion(CARGO_TOML_PATH, newVersion);
      await writePackageJsonVersion(PACKAGE_JSON_PATH, newVersion);

      consola.info(`Building Huginn ${colors.cyan(newVersion)}`);

      // Set environment variables for tauri
      $.env({
         ...process.env,
         TAURI_PRIVATE_KEY: process.env.TAURI_PRIVATE_KEY,
         TAURI_KEY_PASSWORD: process.env.TAURI_KEY_PASSWORD,
      });

      // Run the build script and log the result
      let result: ShellOutput;

      if (type === BuildType.DEBUG) result = await $`cd ../huginn-app-react && bun tauri-build --debug`.quiet();
      else result = await $`cd ../huginn-app-react && bun tauri-build`.quiet();

      // Create a directory for the new version
      await mkdir(newVersionPath);

      const files = await getBuildFiles(type === BuildType.DEBUG ? TAURI_DEBUG_BUILD_PATH : TAURI_RELEASE_BUILD_PATH, newVersion);

      // Get blob for both .zip and .sig files
      const zipFile = Bun.file(files.zipFile.path);
      const sigFile = Bun.file(files.sigFile.path);

      consola.info(`Copying build files to ${colors.cyan(newVersionPath)}`);

      // Copy .zip and .sig files to our new version's folder
      await Bun.write(path.resolve(newVersionPath, files.zipFile.name), zipFile);
      await Bun.write(path.resolve(newVersionPath, files.sigFile.name), sigFile);

      consola.success(`Build completed for version ${colors.cyan(newVersion)} ${getVersionTypeText(type)}`);

      // if (disablePublishing) {
      //    return;
      // }

      // await createGithubRelease(newVersion);

      // consola.success(`Created github release`);

      // await updateGistFile(newVersion);

      // consola.success("Updated gist to new version");
   } catch (e) {
      consola.error("Something went wrong... ");
      throw e;
   }
}

async function createGithubRelease(type: BuildType, version: string, description: string) {
   consola.log("");
   consola.info(`Creating release for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);

   // Create the release with a description
   const release = await octokit.rest.repos.createRelease({
      owner: "WerdoxDev",
      repo: REPO,
      tag_name: type === BuildType.DEBUG ? `v${version}-dev` : `v${version}`,
      target_commitish: "master",
      body: description,
   });

   // Get build files from debug or release folders
   const files = await getBuildFiles(
      path.resolve(type === BuildType.DEBUG ? DEBUG_BUILDS_PATH : RELEASE_BUILDS_PATH, version),
      version
   );

   consola.info("Uploading files...");
   // Convert build files to strings
   const zipFileString = await Bun.file(files.zipFile.path).arrayBuffer();
   const sigFileString = await Bun.file(files.sigFile.path).text();

   // Upload both .zip and .sig files to the release
   await octokit.rest.repos.uploadReleaseAsset({
      name: files.zipFile.name,
      release_id: release.data.id,
      owner: "WerdoxDev",
      repo: REPO,
      data: zipFileString as unknown as string,
      headers: { "content-type": "application/zip" },
   });

   await octokit.rest.repos.uploadReleaseAsset({
      name: files.sigFile.name,
      release_id: release.data.id,
      owner: "WerdoxDev",
      repo: REPO,
      data: sigFileString,
   });

   consola.log("");
   consola.success(`Created github release for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
}

function getVersionTypeText(type: BuildType): string {
   return type === BuildType.DEBUG ? colors.red("debug") : colors.green("release");
}

// async function logVersions() {
//    consola.start("Reading versions...\n");
//    const folders = await getVersions(BuildType.RELEASE);

//    if (folders.length === 0) {
//       consola.fail("No versions are currently available!");
//       return;
//    }

//    for (let i = 0; i < folders.length; i++) {
//       const folder = folders[i];
//       const versionText = colors.cyan(folder);
//       const isLatestText = i === 0 ? colors.bold(colors.green("Latest")) : "";

//       consola.info(`Version ${versionText} ${isLatestText}`);
//    }
// }

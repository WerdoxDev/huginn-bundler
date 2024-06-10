import { semver } from "bun";
import { mkdir, readdir } from "node:fs/promises";
import path from "path";
import { BuildType, type BuildFiles, type Version, type AppVersion } from "./types";

export const DEBUG_BUILDS_PATH = process.env.DEBUG_BUILDS_PATH!;
export const RELEASE_BUILDS_PATH = process.env.RELEASE_BUILDS_PATH!;

export const TAURI_DEBUG_BUILD_PATH = process.env.TAURI_DEBUG_BUILD_PATH!;
export const TAURI_RELEASE_BUILD_PATH = process.env.TAURI_RELEASE_BUILD_PATH!;

export const CARGO_TOML_PATH = process.env.CARGO_TOML_PATH!;
export const PACKAGE_JSON_PATH = process.env.PACKAGE_JSON_PATH!;

export const GIST_ID = process.env.GIST_ID!;
export const REPO = process.env.REPO_NAME!;

/**
 * @returns all version in either debug or release folders
 */
export async function getVersions(type: BuildType): Promise<AppVersion[]> {
   const folders = (await readdir(type === BuildType.DEBUG ? DEBUG_BUILDS_PATH : RELEASE_BUILDS_PATH)).sort(semver.order).reverse();
   return folders.map((x) => ({ type, version: stringToVersion(x) }));
}

/**
 * @returns the last version in either debug or release folders
 */
export async function getLastVersion(type: BuildType): Promise<AppVersion | null> {
   const versions = await getVersions(type);
   return versions.length === 0 ? null : versions[0];
}

/**
 * @returns the given version with an increased patch number so 0.3.0 becomes 0.3.1
 */
export function getPatchedVersion(version: string, orderedVersions: AppVersion[]): string {
   const latestVersion = orderedVersions?.[0].version ?? { major: 0, minor: 0, patch: 0 };
   const versionToPatch = stringToVersion(version);

   if (versionToPatch.patch !== undefined) throw new Error("Input version cannot have a patch number");
   if (versionToPatch.major < latestVersion.major || versionToPatch.minor < latestVersion.minor)
      throw new Error("Input version cannot be less than latest available version");

   // If we have the same major and minor, just add 1 to the patch otherwise just a 0
   if (versionToPatch.major === latestVersion.major && versionToPatch.minor === latestVersion.minor) {
      versionToPatch.patch = latestVersion.patch! + 1;
   } else {
      versionToPatch.patch = 0;
   }

   return versionToString(versionToPatch);
}

/**
 * @returns a BuildFiles object that contains both .zip and .sig files from the tauri debug/release build folder
 */
export async function getBuildFiles(buildPath: string, version: string): Promise<BuildFiles> {
   const files = await readdir(buildPath);

   const zipFileName = files.find((x) => x.endsWith(".zip") && x.includes(version));
   const sigFileName = files.find((x) => x.endsWith(".sig") && x.includes(version));

   if (!zipFileName || !sigFileName) throw new Error(`.zip or .sig file not found in (${buildPath})`);

   const zipFilePath = path.resolve(buildPath, zipFileName);
   const sigFilePath = path.resolve(buildPath, sigFileName);

   return { zipFile: { name: zipFileName, path: zipFilePath }, sigFile: { name: sigFileName, path: sigFilePath } };
}

/**
 * @returns a Version object that contains major, minor, patch numbers
 */
export function stringToVersion(version: string): Version {
   const split = version.split(".");
   const patch = split?.[2] ?? undefined;
   if (split.length < 2) throw new Error("Version string was invalid");

   return { major: parseInt(split[0]), minor: parseInt(split[1]), patch: patch ? parseInt(patch) : undefined };
}

/**
 * @returns a String which contains major, minor, patch numbers
 */
export function versionToString(version: Version): string {
   return `${version.major}.${version.minor}.${version.patch}`;
}

/**
 * Writes the specified version to Cargo.toml file
 */
export async function writeCargoTomlVersion(path: string, version: string) {
   const cargoToml = Bun.file(path);

   const text = await cargoToml.text();
   const modifiedText = text
      .split("\n")
      .map((x) => {
         if (x.startsWith("version = ")) {
            return `version = "${version}"`;
         }

         return x;
      })
      .join("\n");

   await Bun.write(path, modifiedText);
}

/**
 * Writes the specified version to a package.json file
 */
export async function writePackageJsonVersion(path: string, version: string) {
   const packageJson = Bun.file(path);

   const text = await packageJson.text();
   const modifiedText = text
      .split("\n")
      .map((x) => {
         if (x.trim().startsWith('"version"')) {
            return `"version": "${version}",`;
         }

         return x;
      })
      .join("\n");

   await Bun.write(path, modifiedText);
}

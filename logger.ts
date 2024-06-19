import consola from "consola";
import { BuildType, type Version } from "./types";
import { colors } from "consola/utils";

export const logger = {
   bundlerInfo() {
      consola.log(colors.green(colors.bold("HUGINN BUNDLER\n")));
   },

   startingBuild(version: string, type: BuildType) {
      consola.log("");
      consola.info(`Started build for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },
   versionFieldsUpdated(version: string) {
      consola.info(`Updating version fields to ${colors.cyan(version)}`);
   },
   buildingApp(version: string) {
      consola.info(`Building Huginn ${colors.cyan(version)}`);
   },
   copyingBuildFiles(path: string) {
      consola.info(`Copying build files to ${colors.cyan(path)}`);
   },
   buildCompleted(version: string, type: BuildType) {
      consola.log("");
      consola.success(`Build completed for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },

   creatingRelease(version: string, type: BuildType) {
      consola.info(`Creating release for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },
   uploadingReleaseFiles() {
      consola.log("");
      consola.info("Uploading release files to Github...");
   },
   releaseCreated(version: string, type: BuildType) {
      consola.success(`Created github release for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },

   updatingGistFile() {
      consola.log("");
      consola.info("Updating gist file...");
   },
   gistFileUpdated(version: string, type: BuildType) {
      consola.success(`Updated gist file for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },

   releaseDeleted(version: string, type: BuildType) {
      consola.log("");
      consola.success(`Successfuly deleted release for version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },

   versionDeleted(version: string, type: BuildType) {
      consola.log("");
      consola.success(`Successfuly deleted version ${colors.cyan(version)} ${getVersionTypeText(type)}`);
   },
};

export function getVersionTypeText(type: BuildType): string {
   return type === BuildType.DEBUG ? colors.red("debug") : colors.green("release");
}

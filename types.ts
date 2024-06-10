export type Version = {
   patch?: number;
   minor: number;
   major: number;
};

export enum BuildType {
   RELEASE = "RELEASE",
   DEBUG = "DEBUG",
}

export type AppVersion = {
   type: BuildType;
   version: Version;
};

export type BuildFiles = {
   zipFile: { path: string; name: string };
   sigFile: { path: string; name: string };
};

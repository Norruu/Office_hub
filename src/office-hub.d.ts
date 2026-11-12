export {};

type LaunchResult = { ok: boolean; error?: string; cancelled?: boolean };
type SettingsResult = { ok: boolean; error?: string; url?: string };
type InstallResult = { ok: boolean; error?: string; unauthorized?: boolean };
type Progress = { systemId: string; received: number; total: number };
type UpdateState =
  | { state: "idle"; message?: string }
  | { state: "checking" }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string; notes: string }
  | { state: "error"; message: string };

type DetectResult = {
ok: boolean;
unauthorized?: boolean;
error?: string;
found: Record<string, string>;
};

declare global {
  interface Window {
    officeHub: {
      launch(systemId: string): Promise<LaunchResult>;
      getLaunchTargets(): Promise<Record<string, { type: string; value: string }>>;
      chooseProgram(systemId: string): Promise<LaunchResult>;
      setUrlTarget(systemId: string, url: string): Promise<LaunchResult>;
      clearTarget(systemId: string): Promise<LaunchResult>;
      getServerUrl(): Promise<string>;
      setServerUrl(url: string): Promise<SettingsResult>;
      platform: "windows" | "linux" | "other";
      downloadInstaller(systemId: string, platform: string, token: string): Promise<InstallResult>;
      runInstaller(systemId: string): Promise<InstallResult>;
      showInstaller(systemId: string): Promise<InstallResult>;
      onDownloadProgress(callback: (p: Progress) => void): () => void;
      getAppVersion(): Promise<string>;
      getUpdateState(): Promise<UpdateState>;
      checkForUpdates(): Promise<UpdateState>;
      applyUpdate(): Promise<{ ok: boolean; error?: string }>;
      onUpdateState(callback: (state: UpdateState) => void): () => void;
      detectPrograms(token: string): Promise<DetectResult>;
      useDetectedProgram(systemId: string, token: string): Promise<InstallResult>;
      getDeviceInfo(): Promise<{ deviceId: string; hostname: string; platform: string }>;
      checkTargets(): Promise<Record<string, "ready" | "broken">>;
    };
  }
}
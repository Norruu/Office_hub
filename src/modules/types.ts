import type { ComponentType } from "react";

// Everything the Hub gives a module. Modules get nothing else.
export type ModuleContext = {
  serverUrl: string;
  token: string;
  username: string;
  role: string;
  onExpired: () => void; // call this when the server answers 401
};

export type HubModule = {
  id: string; // must match the id of a row in the `systems` table
  name: string;
  component: ComponentType<{ ctx: ModuleContext }>;
};
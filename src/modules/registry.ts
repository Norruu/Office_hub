import type { HubModule } from "./types";
import HelloModule from "./hello/HelloModule";

// To add an app later, import it and add one line here.
export const modules: HubModule[] = [
  { id: "hello-001", name: "Hello", component: HelloModule },
];
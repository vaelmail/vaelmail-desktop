import type { Settings } from "./types";
export type SaveSnapshot = {
  status: "idle" | "saving" | "saved" | "failed";
  values: Partial<Settings>;
  error?: string;
};
export class SettingsWriter {
  private pending: Partial<Settings> = {};
  private values: Partial<Settings> = {};
  private versions = new Map<keyof Settings, number>();
  private running: Promise<void> | null = null;
  private sequence = 0;
  constructor(
    private persist: (patch: Partial<Settings>) => Promise<Settings>,
    private publish: (value: SaveSnapshot) => void,
  ) {}
  patch(patch: Partial<Settings>) {
    for (const key of Object.keys(patch) as (keyof Settings)[])
      this.versions.set(key, ++this.sequence);
    this.pending = { ...this.pending, ...patch };
    this.values = { ...this.values, ...patch };
    this.publish({ status: "saving", values: { ...this.values } });
    return this.start();
  }
  retry() {
    this.publish({ status: "saving", values: { ...this.values } });
    return this.start();
  }
  private start(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().finally(() => {
      this.running = null;
    });
    return this.running;
  }
  private async drain() {
    while (Object.keys(this.pending).length) {
      const patch = this.pending;
      this.pending = {};
      const versions = new Map(this.versions);
      try {
        await this.persist(patch);
        for (const key of Object.keys(patch) as (keyof Settings)[])
          if (versions.get(key) === this.versions.get(key)) delete this.values[key];
        this.publish({
          status: Object.keys(this.pending).length ? "saving" : "saved",
          values: { ...this.values },
        });
      } catch (error) {
        this.pending = { ...patch, ...this.pending };
        this.publish({
          status: "failed",
          values: { ...this.values },
          error: (error as Error).message,
        });
        return;
      }
    }
  }
}

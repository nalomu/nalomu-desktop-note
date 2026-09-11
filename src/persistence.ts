/** Coalesce edits while serializing writes. A failed snapshot stays pending for retry. */
export class SaveQueue<T> {
  private pending: { value: T } | undefined;
  private running: Promise<void> | undefined;
  constructor(private write: (value: T) => Promise<void>) {}
  set(value: T) {
    this.pending = { value };
  }
  async flush(): Promise<void> {
    if (this.running) {
      await this.running;
      if (this.pending) return this.flush();
      return;
    }
    this.running = (async () => {
      while (this.pending) {
        const snapshot = this.pending;
        await this.write(snapshot.value);
        if (this.pending === snapshot) this.pending = undefined;
      }
    })();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
  }
}

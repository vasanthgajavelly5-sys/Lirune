import type { ReadingProgress } from '@/models/Book';

type ProgressWriter = (progress: ReadingProgress) => Promise<void>;

interface PendingProgress {
  progress: ReadingProgress;
  waiters: { resolve: () => void; reject: (error: unknown) => void }[];
}

export class ProgressPersistenceQueue {
  private readonly pending = new Map<string, PendingProgress>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly write: ProgressWriter;

  constructor(write: ProgressWriter) {
    this.write = write;
  }

  enqueue(progress: ReadingProgress): Promise<void> {
    const existing = this.pending.get(progress.bookId);
    const pending = existing || { progress, waiters: [] };
    pending.progress = progress;
    this.pending.set(progress.bookId, pending);

    const result = new Promise<void>((resolve, reject) => {
      pending.waiters.push({ resolve, reject });
    });

    if (!this.running.has(progress.bookId)) {
      const drain = this.drain(progress.bookId);
      this.running.set(progress.bookId, drain);
    }
    return result;
  }

  async flush(bookId: string): Promise<void> {
    while (this.running.has(bookId) || this.pending.has(bookId)) {
      const running = this.running.get(bookId);
      if (running) {
        await running;
      } else {
        const pending = this.pending.get(bookId);
        if (pending) {
          const drain = this.drain(bookId);
          this.running.set(bookId, drain);
          await drain;
        }
      }
    }
  }

  private async drain(bookId: string): Promise<void> {
    try {
      while (this.pending.has(bookId)) {
        const pending = this.pending.get(bookId)!;
        this.pending.delete(bookId);
        try {
          await this.write(pending.progress);
          pending.waiters.forEach(({ resolve }) => resolve());
        } catch (error) {
          pending.waiters.forEach(({ reject }) => reject(error));
        }
      }
    } finally {
      this.running.delete(bookId);
    }
  }
}
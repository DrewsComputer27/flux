import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { Store, StoreWithWebhooks } from '../types.js';
import type { StorageAdapter } from '../store.js';

const defaultData: Store = {
  projects: [],
  epics: [],
  tasks: [],
};

export function createSqliteAdapter(filePath: string): StorageAdapter {
  // Ensure directory exists
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(filePath, { create: true });

  // WAL mode for better concurrency with multiple readers
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL)');

  const selectStmt = db.prepare('SELECT data FROM store WHERE id = 1');
  const insertStmt = db.prepare('INSERT INTO store (id, data) VALUES (1, ?)');
  const updateStmt = db.prepare('UPDATE store SET data = ? WHERE id = 1');

  let _data: Store = { ...defaultData };

  // Helper to read fresh data from DB
  const readFromDb = (): Store => {
    const row = selectStmt.get() as { data?: string } | null;
    if (row?.data) {
      try {
        return JSON.parse(row.data) as Store;
      } catch {
        return { ...defaultData };
      }
    }
    return { ...defaultData };
  };

  return {
    get data() {
      return _data;
    },
    read() {
      // Always refresh from DB - critical for concurrent access
      _data = readFromDb();
      if (!selectStmt.get()) {
        // Initialize DB if empty
        insertStmt.run(JSON.stringify(_data));
      }
    },
    write() {
      // Use transaction to ensure atomic read-modify-write
      db.transaction(() => {
        // Re-read current state inside transaction
        const current = readFromDb() as StoreWithWebhooks;
        const currentData = _data as StoreWithWebhooks;

        // tasks/epics/projects/blobs: write directly from in-memory state (_data), which
        // is authoritative. Using mergeById here would resurrect deleted items — DB still
        // contains the deleted record, mergeById seeds from DB first, so deleted items
        // survive the merge. Direct assignment means deletions in _data are final.
        //
        // webhooks/webhook_deliveries/api_keys: use mergeById because multiple processes
        // (e.g. webhook delivery handlers) may write these concurrently. We want to
        // preserve records added by other processes, not clobber them.
        //
        // IMPORTANT: must include all StoreWithWebhooks fields here — if a field is
        // omitted, JSON.stringify will silently drop it and it will be lost on the next
        // server restart. This was the root cause of the webhook persistence bug.
        const merged: StoreWithWebhooks = {
          projects: currentData.projects,
          epics: currentData.epics,
          tasks: currentData.tasks,
          blobs: currentData.blobs || [],
          webhooks: mergeById(current.webhooks || [], currentData.webhooks || []),
          webhook_deliveries: mergeById(current.webhook_deliveries || [], currentData.webhook_deliveries || []),
          api_keys: mergeById(current.api_keys || [], currentData.api_keys || []),
          // cli_auth_requests use `token` (not `id`) so mergeById cannot be used.
          // These are short-lived (5-minute expiry) so we keep the in-memory version.
          cli_auth_requests: currentData.cli_auth_requests || [],
        };

        const serialized = JSON.stringify(merged);
        const row = selectStmt.get();
        if (row) {
          updateStmt.run(serialized);
        } else {
          insertStmt.run(serialized);
        }

        // Update in-memory state to match what we wrote
        _data = merged;
      })();
    },
  };
}

// Merge arrays by ID, preferring items from 'updated' but keeping items only in 'current'
function mergeById<T extends { id: string }>(current: T[], updated: T[]): T[] {
  const result = new Map<string, T>();
  
  // Start with current items
  for (const item of current) {
    result.set(item.id, item);
  }
  
  // Overlay with updated items (overwrites if same ID)
  for (const item of updated) {
    result.set(item.id, item);
  }
  
  return Array.from(result.values());
}

import assert from "node:assert/strict";
import {
  loadLastWorkspaceHandle,
  saveLastWorkspaceHandle,
} from "./workspace-storage.js";

class MockRequest extends EventTarget {
  result = undefined;
  error = null;
}

class MockTransaction extends EventTarget {
  constructor(store) {
    super();
    this.store = store;
    this.error = null;
  }

  objectStore() {
    return {
      put: (value, key) => this.#request(() => this.store.set(key, value)),
      get: (key) => this.#request(() => this.store.get(key)),
    };
  }

  #request(operation) {
    const request = new MockRequest();
    queueMicrotask(() => {
      request.result = operation();
      request.dispatchEvent(new Event("success"));
      this.dispatchEvent(new Event("complete"));
    });
    return request;
  }
}

class MockDatabase {
  stores = new Map();
  objectStoreNames = {
    contains: (name) => this.stores.has(name),
  };

  createObjectStore(name) {
    const store = new Map();
    this.stores.set(name, store);
    return store;
  }

  transaction(name) {
    return new MockTransaction(this.stores.get(name));
  }

  close() {}
}

const previousIndexedDB = globalThis.indexedDB;
const database = new MockDatabase();
globalThis.indexedDB = {
  open() {
    const request = new MockRequest();
    queueMicrotask(() => {
      request.result = database;
      request.dispatchEvent(new Event("upgradeneeded"));
      request.dispatchEvent(new Event("success"));
    });
    return request;
  },
};

try {
  const handle = { name: "workspace" };
  await saveLastWorkspaceHandle(handle);
  assert.deepEqual(await loadLastWorkspaceHandle(), handle);

  delete globalThis.indexedDB;
  await assert.rejects(loadLastWorkspaceHandle(), /IndexedDB/);
} finally {
  if (previousIndexedDB === undefined) delete globalThis.indexedDB;
  else globalThis.indexedDB = previousIndexedDB;
}

console.log("workspace-storage tests passed");

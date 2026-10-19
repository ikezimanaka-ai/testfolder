const DATABASE_NAME = "monac-editor";
const DATABASE_VERSION = 1;
const STORE_NAME = "workspaces";
const LAST_WORKSPACE_KEY = "last-opened";

function openDatabase() {
  if (!globalThis.indexedDB) {
    throw new Error("このブラウザーはIndexedDBに対応していません。");
  }

  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("前回のフォルダー情報を開けませんでした。"));
    }, { once: true });
  });
}

async function storeRequest(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let requestFinished = false;
    let transactionFinished = false;
    let result;
    const complete = () => {
      if (requestFinished && transactionFinished) resolve(result);
    };
    request.addEventListener("success", () => {
      result = request.result;
      requestFinished = true;
      complete();
    }, { once: true });
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("前回のフォルダー情報を保存できませんでした。"));
    }, { once: true });
    transaction.addEventListener("complete", () => {
      database.close();
      transactionFinished = true;
      complete();
    }, { once: true });
    transaction.addEventListener("abort", () => {
      database.close();
      reject(transaction.error ?? new Error("前回のフォルダー情報を保存できませんでした。"));
    }, { once: true });
    transaction.addEventListener("error", () => {
      database.close();
      reject(transaction.error ?? new Error("前回のフォルダー情報を保存できませんでした。"));
    }, { once: true });
  });
}

export function saveLastWorkspaceHandle(handle) {
  return storeRequest("readwrite", (store) =>
    store.put(handle, LAST_WORKSPACE_KEY)
  );
}

export function loadLastWorkspaceHandle() {
  return storeRequest("readonly", (store) =>
    store.get(LAST_WORKSPACE_KEY)
  );
}

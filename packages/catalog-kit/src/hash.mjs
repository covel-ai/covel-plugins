import { createHash } from "node:crypto";

export const HASH_SCHEME = "covel-package-v1";
export const PACKAGER_VERSION = "covel-zip-v1";
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const safePath = (value) => typeof value === "string" && value.length <= 512 &&
  !/[\\\x00-\x1f\x7f]/.test(value) && value.split("/").every((part) => part && part !== "." && part !== "..");
const byPath = (a, b) => Buffer.compare(Buffer.from(a[0]), Buffer.from(b[0]));

export function packageKey(repositoryId, kind, packagePath) {
  if (!["plugins", "worlds"].includes(kind) || (packagePath !== null && packagePath !== "" && !safePath(packagePath))) throw new Error("Invalid package identity");
  if (repositoryId !== null && (!Number.isSafeInteger(repositoryId) || repositoryId < 1)) throw new Error("Invalid GitHub repository ID");
  return `${repositoryId === null ? "local" : `github:${repositoryId}`}:${kind}:${packagePath === null ? "repository" : `package:${encodeURIComponent(packagePath)}`}`;
}

/** Paths are UTF-8 byte-sorted. File bytes (including line endings) are unchanged.
 * Each row is [relative path, executable bit, SHA256(bytes)], encoded as JSON.
 */
export function fingerprintFiles(files) {
  const rows = [...files].map(([name, value]) => {
    if (!safePath(name)) throw new Error("Unsafe package path");
    const data = value instanceof Uint8Array ? value : value.data;
    if (!(data instanceof Uint8Array)) throw new Error("Expected file bytes");
    return [name, value.mode === "100755" ? "100755" : "100644", sha256(data)];
  }).sort(byPath);
  return sha256(`${HASH_SCHEME}\n${JSON.stringify(rows)}`);
}

/** Cheap source-change detector. This is deliberately NOT the package byte digest. */
export function fingerprintTree(tree, packagePath) {
  if (packagePath !== "" && !safePath(packagePath)) throw new Error("Unsafe package path");
  const prefix = packagePath ? `${packagePath}/` : "";
  const rows = tree.filter((file) => file.path.startsWith(prefix) && file.type !== "tree")
    .map((file) => {
      const name = file.path.slice(prefix.length);
      if (!safePath(name) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(file.sha)) throw new Error("Invalid Git tree entry");
      return [name, file.mode, file.sha];
    }).sort(byPath);
  return sha256(`covel-git-tree-v1\n${JSON.stringify(rows)}`);
}

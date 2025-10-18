import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );

    if (paths.length === 0) {
      const defaultBucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (defaultBucketId) {
        return [`${defaultBucketId}/public`];
      }
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!privateDir) {
      const defaultBucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (defaultBucketId) {
        return `${defaultBucketId}/.private`;
      }
    }
    return privateDir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    const searchPaths = this.getPublicObjectSearchPaths();
    for (const searchPath of searchPaths) {
      const fullPath = `${searchPath}/${filePath}`;
      const [bucket, ...pathParts] = fullPath.split("/");
      const objectPath = pathParts.join("/");
      const file = objectStorageClient.bucket(bucket).file(objectPath);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async getObjectEntityFile(path: string): Promise<File> {
    const normalizedPath = this.normalizeObjectEntityPath(path);
    const privateDir = this.getPrivateObjectDir();
    const fullPath = `${privateDir}/${normalizedPath}`;
    const pathSegments = fullPath.split("/").filter(s => s); // Remove empty strings
    const [bucket, ...pathParts] = pathSegments;
    const objectPath = pathParts.join("/");
    const file = objectStorageClient.bucket(bucket).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return file;
  }

  normalizeObjectEntityPath(path: string): string {
    if (path.startsWith("/objects/")) {
      return path.replace("/objects/", "");
    }
    return path;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateDir}/${objectId}`;
    const pathSegments = fullPath.split("/").filter(s => s); // Remove empty strings
    const [bucket, ...pathParts] = pathSegments;
    const objectPath = pathParts.join("/");
    const file = objectStorageClient.bucket(bucket).file(objectPath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
    });

    return url;
  }

  async trySetObjectEntityAclPolicy(
    uploadURL: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const urlObj = new URL(uploadURL);
    const pathParts = urlObj.pathname.split("/");
    const bucket = pathParts[1];
    const objectPath = pathParts.slice(2).join("/");
    const file = objectStorageClient.bucket(bucket).file(objectPath);

    await setObjectAclPolicy(file, aclPolicy);

    const privateDir = this.getPrivateObjectDir();
    const privateDirSegments = privateDir.split("/").filter(s => s); // Remove empty strings
    const [privateDirBucket, ...privateDirPathParts] = privateDirSegments;
    const privateDirPath = privateDirPathParts.join("/");

    if (bucket === privateDirBucket && objectPath.startsWith(privateDirPath)) {
      return `/objects/${objectPath.replace(privateDirPath + "/", "")}`;
    }

    return `/objects/${objectPath}`;
  }

  async canAccessObjectEntity({
    objectFile,
    userId,
    requestedPermission,
  }: {
    objectFile: File;
    userId?: string;
    requestedPermission: ObjectPermission;
  }): Promise<boolean> {
    return await canAccessObject({ userId, objectFile, requestedPermission });
  }

  downloadObject(file: File, res: Response): void {
    file
      .createReadStream()
      .on("error", (err) => {
        console.error("Error streaming file:", err);
        res.status(500).send("Error streaming file");
      })
      .pipe(res);
  }
}

import "server-only";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { r2Env } from "./env";

/** S3's `DeleteObjects` accepts at most 1000 keys per request. */
const DELETE_BATCH = 1000;

let client: S3Client | undefined;

function s3() {
  if (!client) {
    const env = r2Env();
    client = new S3Client({
      endpoint: env.endpoint,
      region: env.region,
      forcePathStyle: env.forcePathStyle,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
    });
  }
  return client;
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: r2Env().bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Returns null when the object does not exist. */
export async function getObject(
  key: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: r2Env().bucket, Key: key }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

export async function deleteObjects(keys: string[]): Promise<void> {
  const bucket = r2Env().bucket;
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    const res = await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.slice(i, i + DELETE_BATCH).map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    if (res?.Errors?.length) {
      throw new Error(`R2 failed to delete ${res.Errors.length} object(s)`);
    }
  }
}

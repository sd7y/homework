import { S3Storage } from 'coze-coding-dev-sdk';

let storageInstance: S3Storage | null = null;

export function getStorage(): S3Storage {
  if (!storageInstance) {
    storageInstance = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });
  }
  return storageInstance;
}

/** 上传题目图片，返回实际存储 key（必须持久化 key 而非 URL） */
export async function uploadQuestionImage(
  userId: string,
  fileContent: Buffer,
  ext: string,
  contentType: string,
): Promise<string> {
  const storage = getStorage();
  const safeExt = ext.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const key = await storage.uploadFile({
    fileContent,
    fileName: `mistakes/${userId}/${Date.now()}.${safeExt}`,
    contentType,
  });
  return key;
}

/** 按需生成签名访问 URL（默认 2 小时有效） */
export async function signImageUrl(key: string, expireTime = 7200): Promise<string> {
  if (!key) return '';
  const storage = getStorage();
  return storage.generatePresignedUrl({ key, expireTime });
}

export async function signImageKeys(keys: string[], expireTime = 7200): Promise<string[]> {
  return Promise.all(keys.map((k) => signImageUrl(k, expireTime)));
}

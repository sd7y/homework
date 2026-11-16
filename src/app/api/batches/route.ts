import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, badRequest, serverError } from '@/lib/server/auth';
import { uploadQuestionImage } from '@/lib/server/storage';
import { GRADES, MAX_UPLOAD_IMAGES } from '@/lib/constants';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB 上限（前端已压缩）

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'jpg',
  'image/heif': 'jpg',
};

/**
 * 创建批改批次：上传图片到对象存储，写入 batches 记录。
 * multipart/form-data: images(多个文件) + subject_id + grade
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  try {
    const formData = await request.formData();
    const subjectId = String(formData.get('subject_id') ?? '');
    const grade = String(formData.get('grade') ?? '');
    const files = formData.getAll('images').filter((f): f is File => f instanceof File);

    if (!subjectId) {
      return badRequest('请选择科目');
    }
    if (!GRADES.includes(grade as (typeof GRADES)[number])) {
      return badRequest('请选择有效的年级');
    }
    if (files.length === 0) {
      return badRequest('请至少上传一张图片');
    }
    if (files.length > MAX_UPLOAD_IMAGES) {
      return badRequest(`一次最多上传 ${MAX_UPLOAD_IMAGES} 张图片`);
    }

    // 校验科目归属并取冗余名称（名称以服务端为准，防止前端伪造）
    const { data: subjectRow, error: subjectError } = await auth.client
      .from('subjects')
      .select('id, name')
      .eq('id', subjectId)
      .eq('user_id', auth.userId)
      .maybeSingle();
    if (subjectError) throw new Error(`查询科目失败: ${subjectError.message}`);
    if (!subjectRow) return badRequest('科目不存在，请刷新后重试');

    // 逐个上传（保持顺序），记录返回的真实 key
    const imageKeys: string[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return badRequest(`图片「${file.name}」超过 10MB，请压缩后重试`);
      }
      const ext = EXT_BY_TYPE[file.type] ?? 'jpg';
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = await uploadQuestionImage(auth.userId, buffer, ext, file.type || 'image/jpeg');
      imageKeys.push(key);
    }

    const { data, error } = await auth.client
      .from('batches')
      .insert({
        user_id: auth.userId,
        subject_id: subjectRow.id,
        subject: subjectRow.name,
        grade,
        image_keys: imageKeys,
        status: 'uploading',
      })
      .select('id, status, created_at')
      .single();
    if (error) throw new Error(`创建批次失败: ${error.message}`);

    return NextResponse.json({ batch: data, image_count: imageKeys.length });
  } catch (error) {
    return serverError(error, '上传失败');
  }
}

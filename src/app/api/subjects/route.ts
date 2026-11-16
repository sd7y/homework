import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export interface SubjectRow {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
}

/** 科目字典：公共数据，服务端 service role 读取 */
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('subjects')
      .select('id, name, icon, sort_order')
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`查询科目失败: ${error.message}`);
    return NextResponse.json({ subjects: (data ?? []) as SubjectRow[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : '查询科目失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

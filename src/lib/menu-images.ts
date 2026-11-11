import { useCallback, useEffect, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from './supabase';

export const MENU_IMAGE_BUCKET = 'farya-menu-images';
export type MenuImageRecord = {
  item_id: string;
  object_path: string;
  content_type: string;
  size_bytes: number;
  updated_at: string;
};
export type MenuImageMap = Record<string, MenuImageRecord>;

export function publicMenuImageUrl(path: string): string {
  const sb = getSupabase();
  if (!sb) return '';
  return sb.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function localMenuImageUrl(image?: string | null): string {
  if (!image) return '';
  if (/^(https?:|data:|blob:|\/)/i.test(image)) return image;
  return `/img/${image}`;
}

export function useMenuImages() {
  const [images, setImages] = useState<MenuImageMap>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const sb = getSupabase();
    if (!sb) return;
    setLoading(true);
    const { data, error } = await sb.from('farya_menu_item_images')
      .select('item_id,object_path,content_type,size_bytes,updated_at');
    if (error) {
      setLoadError(error.message);
      setLoading(false);
      return;
    }
    const next: MenuImageMap = {};
    for (const row of (data || []) as MenuImageRecord[]) next[row.item_id] = row;
    setImages(next);
    setLoadError('');
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  return { images, setImages, loading, loadError, refresh };
}

import { useEffect, useState } from 'react';
import { getSupabase } from './supabase';
import { MENU_IMAGE_BUCKET } from './menu-images';

type PublicImage = { code: string; object_path: string };

export function usePublicMenuImages() {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      const sb = getSupabase();
      if (!sb) return;
      const { data, error } = await sb.rpc('farya_public_menu_images');
      if (!active || error || !Array.isArray(data)) return;
      const next: Record<string, string> = {};
      for (const row of data as PublicImage[]) {
        if (!row.code || !row.object_path) continue;
        next[row.code] = sb.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(row.object_path).data.publicUrl;
      }
      setImages(next);
    };
    const reloadWhenVisible = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    const timer = window.setInterval(reloadWhenVisible, 60_000);
    window.addEventListener('focus', reloadWhenVisible);
    document.addEventListener('visibilitychange', reloadWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', reloadWhenVisible);
      document.removeEventListener('visibilitychange', reloadWhenVisible);
    };
  }, []);

  return images;
}

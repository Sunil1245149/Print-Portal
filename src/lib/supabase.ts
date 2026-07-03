import { createClient } from '@supabase/supabase-js';

// Helper to get parameters from URL search or hash
const getQueryParam = (name: string): string => {
  try {
    const params = new URLSearchParams(window.location.search);
    let val = params.get(name) || '';
    if (!val && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      val = hashParams.get(name) || '';
    }
    return val;
  } catch (e) {
    return '';
  }
};

const urlFromParam = getQueryParam('sb_url');
const keyFromParam = getQueryParam('sb_key');

// Save to localStorage if found in URL parameters (so the customer's phone remembers the connection)
if (urlFromParam && keyFromParam) {
  try {
    localStorage.setItem('print_shop_supabase_url', urlFromParam);
    localStorage.setItem('print_shop_supabase_key', keyFromParam);
    localStorage.setItem('print_shop_db_mode', 'cloud');
  } catch (e) {}
}

// Retrieve saved credentials from localStorage
let urlFromStorage = '';
let keyFromStorage = '';
try {
  urlFromStorage = localStorage.getItem('print_shop_supabase_url') || '';
  keyFromStorage = localStorage.getItem('print_shop_supabase_key') || '';
} catch (e) {}

// Fallback to Vite build-time environment variables or direct credentials
const env = (import.meta as any).env || {};
const envUrl = env.VITE_SUPABASE_URL || 'https://zyvdenzzqdtllxyzviby.supabase.co';
const envKey = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_MtO7moqrayG5lPz08mGb9A_P8zX2Kr4';

export const supabaseUrl = urlFromParam || urlFromStorage || envUrl;
export const supabaseAnonKey = keyFromParam || keyFromStorage || envKey;

// If credentials are present, Supabase is active
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/**
 * Uploads a base64 data URI directly to Supabase Storage bucket and returns the public URL.
 * Falls back to returning the original base64 string if anything fails or if Supabase is not configured.
 */
export const uploadBase64ToStorage = async (
  base64Str: string,
  bucketName: string = 'documents'
): Promise<string> => {
  if (!supabase || !base64Str || !base64Str.startsWith('data:')) {
    return base64Str;
  }

  try {
    const parts = base64Str.split(';base64,');
    if (parts.length !== 2) {
      return base64Str;
    }

    const mime = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const u8Array = new Uint8Array(new ArrayBuffer(rawLength));

    for (let i = 0; i < rawLength; i++) {
      u8Array[i] = raw.charCodeAt(i);
    }

    const blob = new Blob([u8Array], { type: mime });

    // Detect file extension from mime type
    let ext = 'jpg';
    if (mime.includes('png')) ext = 'png';
    else if (mime.includes('pdf')) ext = 'pdf';
    else if (mime.includes('webp')) ext = 'webp';

    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}.${ext}`;
    const filePath = `scans/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, blob, {
        contentType: mime,
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.warn('Supabase storage upload failed:', error);
      throw error;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    console.error('Error in uploadBase64ToStorage:', err);
    // Return original base64 as fallback so the app continues to function seamlessly
    return base64Str;
  }
};


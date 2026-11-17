import { randomBytes } from 'node:crypto';
import { normalizeIndianMobile } from '../../shared/messages.mjs';

let devSecret;

// Server settings from the environment. Nothing here reaches the browser
// except through explicit API responses.
export function readConfig(env = process.env) {
  const onVercel = Boolean(env.VERCEL);
  const hasSupabase = Boolean(env.SUPABASE_URL && (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY));
  // The in-memory store is for local demos and tests only; it loses data on restart.
  const store = env.CONSULT_STORE === 'memory' && !onVercel ? 'memory' : hasSupabase ? 'supabase' : onVercel ? 'supabase' : 'memory';
  let appSecret = env.APP_SECRET || '';
  if (!appSecret && store === 'memory') {
    devSecret ??= randomBytes(32).toString('base64url');
    appSecret = devSecret;
  }
  const hospitalPhone = normalizeIndianMobile(env.HOSPITAL_WHATSAPP || '');
  return Object.freeze({
    store,
    zoomMode: env.PROVIDERS_MODE === 'live' ? 'live' : 'mock',
    siteUrl: (env.SITE_URL || '').replace(/\/+$/, ''),
    appSecret,
    cronSecret: env.CRON_SECRET || '',
    hospitalWhatsapp: hospitalPhone ? hospitalPhone.slice(1) : '',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseSecretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
    vapid: Object.freeze({
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || 'https://sri-siri-hospital-5nct-pink.vercel.app',
    }),
    zoom: Object.freeze({
      accountId: env.ZOOM_ACCOUNT_ID || '',
      clientId: env.ZOOM_CLIENT_ID || '',
      clientSecret: env.ZOOM_CLIENT_SECRET || '',
    }),
  });
}

export function missingSettings(config) {
  const missing = [];
  if (config.store === 'supabase' && !config.supabaseUrl) missing.push('SUPABASE_URL');
  if (config.store === 'supabase' && !config.supabaseSecretKey) missing.push('SUPABASE_SECRET_KEY');
  if (!config.appSecret) missing.push('APP_SECRET');
  if (!config.hospitalWhatsapp) missing.push('HOSPITAL_WHATSAPP');
  if (config.zoomMode === 'live' && !(config.zoom.accountId && config.zoom.clientId && config.zoom.clientSecret)) {
    missing.push('ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET');
  }
  return missing;
}

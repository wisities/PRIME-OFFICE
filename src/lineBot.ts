/**
 * LINE Bot Messaging API & LINE Social Share Integration
 * For PRIME Virtual Office
 */

export interface LineSettings {
  token: string;       // LINE Channel Access Token (Long-lived)
  targetId: string;    // User ID (U...) or Group ID (C... / R...)
  proxyUrl?: string;   // Optional proxy / Supabase Edge Function URL to bypass browser CORS
}

const STORAGE_KEY_TOKEN = 'prime-line-token';
const STORAGE_KEY_TARGET_ID = 'prime-line-target-id';
const STORAGE_KEY_PROXY_URL = 'prime-line-proxy-url';

export const DEFAULT_LINE_TOKEN = (import.meta as any).env?.VITE_LINE_BOT_TOKEN || 'mHLAo9aERsYbNa/ocMw8Us0un3j8Gyz/IrGRPdjKOugRd51021UX5bf57OEE+xOC5xZfRvbtnGTWKxoMahi93p9o/YuEnFk+6+nxnRKPxKa67NgkPPcFdrwEvdeJLapXIGmftatgQfr7yYn3iVFD2wdB04t89/1O/w1cDnyilFU=';
export const DEFAULT_LINE_TARGET_ID = (import.meta as any).env?.VITE_LINE_TARGET_ID || 'Udb131f808fb9ed96c3d0f468b1679bea';

export function getLineSettings(): LineSettings {
  return {
    token: localStorage.getItem(STORAGE_KEY_TOKEN) || DEFAULT_LINE_TOKEN,
    targetId: localStorage.getItem(STORAGE_KEY_TARGET_ID) || DEFAULT_LINE_TARGET_ID,
    proxyUrl: localStorage.getItem(STORAGE_KEY_PROXY_URL) || ''
  };
}

export function saveLineSettings(settings: Partial<LineSettings>) {
  if (settings.token !== undefined) {
    localStorage.setItem(STORAGE_KEY_TOKEN, settings.token.trim());
  }
  if (settings.targetId !== undefined) {
    localStorage.setItem(STORAGE_KEY_TARGET_ID, settings.targetId.trim());
  }
  if (settings.proxyUrl !== undefined) {
    localStorage.setItem(STORAGE_KEY_PROXY_URL, settings.proxyUrl.trim());
  }
}

/**
 * Generate a 1-click LINE Direct Share URL
 * Works on Desktop and Mobile without needing any Bot token!
 */
export function generateLineShareUrl(text: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
}

/**
 * Open LINE App with pre-filled message
 */
export function openLineShare(text: string): void {
  const url = generateLineShareUrl(text);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Send a Push Message via LINE Bot Messaging API
 * If browser blocks due to CORS, falls back gracefully to opening LINE Share
 */
export async function sendLineBotPush(params: {
  text: string;
  token?: string;
  targetId?: string;
  proxyUrl?: string;
}): Promise<{ success: boolean; fallbackUsed: boolean; message: string }> {
  const settings = getLineSettings();
  const token = params.token?.trim() || settings.token;
  const targetId = params.targetId?.trim() || settings.targetId;
  const proxyUrl = params.proxyUrl?.trim() || settings.proxyUrl;

  // If no bot token/target ID is set, open LINE Direct Share immediately
  if (!token || !targetId) {
    openLineShare(params.text);
    return {
      success: true,
      fallbackUsed: true,
      message: 'เปิดแอป LINE เพื่อส่งข้อความเข้ากลุ่มเรียบร้อยแล้ว'
    };
  }

  // If a proxy / Supabase Edge function is specified
  if (proxyUrl) {
    try {
      const resp = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          to: targetId,
          messages: [{ type: 'text', text: params.text }]
        })
      });
      if (resp.ok) {
        return { success: true, fallbackUsed: false, message: 'ส่งข้อความผ่าน LINE Bot สำเร็จแล้ว!' };
      }
    } catch (proxyErr) {
      console.warn('LINE Proxy request failed:', proxyErr);
    }
  }

  // Attempt direct LINE Push API call
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: targetId,
        messages: [{ type: 'text', text: params.text }]
      })
    });

    if (response.ok) {
      return { success: true, fallbackUsed: false, message: 'ส่งข้อความผ่าน LINE Bot เข้ากลุ่มสำเร็จ!' };
    } else {
      const errData = await response.json().catch(() => ({}));
      console.warn('LINE Bot API error response:', errData);
      // Fallback to LINE Direct Share so the user doesn't miss the alert
      openLineShare(params.text);
      return {
        success: true,
        fallbackUsed: true,
        message: 'ยิง Bot ไม่สำเร็จ ระบบจึงเปิดแอป LINE เพื่อให้แชร์ข้อความแทน'
      };
    }
  } catch (err) {
    // Usually browser CORS blockage
    console.warn('Direct LINE Push API failed (CORS or network error), falling back to LINE Share:', err);
    openLineShare(params.text);
    return {
      success: true,
      fallbackUsed: true,
      message: 'เบราว์เซอร์ติด CORS บอท LINE ระบบเปิดแอป LINE ให้เลือกห้องแชทส่งได้ทันที'
    };
  }
}

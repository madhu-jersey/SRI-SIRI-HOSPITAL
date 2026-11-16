export class ApiError extends Error {
  status: number;
  fields: Record<string, string>;
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type ApiInit = { method?: 'GET' | 'POST' | 'PUT'; body?: unknown; token?: string; signal?: AbortSignal };

export async function api<T>(route: string, { method = 'GET', body, token, signal }: ApiInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/app/${route}`, {
      method,
      signal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, 'No internet connection. Please check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'Something went wrong. Please try again.', data.fields ?? {});
  }
  return data as T;
}

export type PublicConfig = {
  hospitalWhatsapp: string;
  hospitalWhatsappDisplay: string;
  holdMinutes: number;
  auth: 'demo' | 'supabase';
  doctor: { name: string; qualification: string; registration: string; minutes: number };
};

export type Slot = { start: string; end: string; period: 'morning' | 'afternoon' | 'evening' };
export type SlotDay = { date: string; weekday: number; open: boolean; slots: Slot[] };

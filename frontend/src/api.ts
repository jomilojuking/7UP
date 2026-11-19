export const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// Optional: only needed when the backend sets HFAIO_API_KEY. Anything in a
// VITE_ variable ends up in the browser bundle, so for a public site rely on
// the backend's rate limits and job cap, not on this key being secret.
const API_KEY = import.meta.env.VITE_API_KEY as string | undefined;

function authHeaders(): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY } : {};
}

async function handle(res: Response) {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    let msg = `Request failed (${res.status})`;
    if (typeof detail === "string") msg = detail;
    else if (Array.isArray(detail) && detail[0]?.msg) msg = detail[0].msg;
    throw new Error(msg);
  }
  return data;
}

export async function request(path: string, options?: RequestInit) {
  const res = await fetch(API + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
  });
  return handle(res);
}

// multipart/form-data upload (the browser sets the Content-Type boundary)
export async function upload(path: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(API + path, { method: "POST", body, headers: authHeaders() });
  return handle(res);
}

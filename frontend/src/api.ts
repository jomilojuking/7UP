export const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";
export async function request(path: string, options?: RequestInit) {
    const res = await fetch(API + path, {
        headers: { "Content-Type": "application/json" },
...options,
});

const data = await res.json().catch(() => null);
if (!res.ok) {
    const detail = data?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
}
return data;
}
import type { PlaceSuggestion, TripDetail, TripRequest, TripSummary } from "./types"

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    })
  } catch {
    throw new ApiError("Can't reach the Wander Mind server. Is the backend running?", 0)
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === "string") message = body.detail
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join(", ")
    } catch {}
    throw new ApiError(message, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  health: () =>
    request<{ ok: boolean; llm_providers: string[]; searxng: boolean; youtube_api: boolean; reddit_oauth: boolean }>(
      "/api/health"
    ),
  places: (q: string) => request<PlaceSuggestion[]>(`/api/places?q=${encodeURIComponent(q)}`),
  placePhoto: (name: string) =>
    request<{ image: string; description: string }>(`/api/places/photo?name=${encodeURIComponent(name)}`),
  parse: (text: string) => request<Partial<TripRequest>>("/api/parse", { method: "POST", body: JSON.stringify({ text }) }),
  createTrip: (req: TripRequest) => request<{ id: string }>("/api/trips", { method: "POST", body: JSON.stringify(req) }),
  trips: () => request<TripSummary[]>("/api/trips"),
  trip: (id: string) => request<TripDetail>(`/api/trips/${id}`),
  tweak: (id: string, instruction: string) =>
    request<{ id: string }>(`/api/trips/${id}/tweak`, { method: "POST", body: JSON.stringify({ instruction }) }),
  retry: (id: string) => request<{ id: string }>(`/api/trips/${id}/retry`, { method: "POST" }),
  deleteTrip: (id: string) => request<void>(`/api/trips/${id}`, { method: "DELETE" }),
  report: (
    id: string,
    body: { item_title: string; place_name: string; kind: string; price_paid: number; unit: string; note: string }
  ) => request<{ ok: boolean }>(`/api/trips/${id}/reports`, { method: "POST", body: JSON.stringify(body) }),
}

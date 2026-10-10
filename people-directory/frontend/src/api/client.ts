import type { Anomaly, Cycle, Device, EventRecord, Job, JobCreate, ReadinessResult } from '../types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/mobile-ps${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string | Array<{ msg?: string }> }
    const detail = body.detail
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail)
        ? detail.map(d => d.msg).filter(Boolean).join('; ')
        : `${response.status} ${response.statusText}`
    throw new Error(message || 'Request failed')
  }
  return response.json() as Promise<T>
}

export const api = {
  devices: () => request<Device[]>('/devices'),
  deviceStatus: (serial: string) => request<Device>(`/devices/${encodeURIComponent(serial)}/status`),
  readiness: (ue_a_serial: string, ue_b_serial: string, destination_ip: string) =>
    request<ReadinessResult>('/readiness', {
      method: 'POST',
      body: JSON.stringify({ ue_a_serial, ue_b_serial, destination_ip }),
    }),
  connectivity: (destination_ip: string, count = 4) =>
    request<{
      destination_ip: string
      server_reachable: boolean
      latency_ms: number | null
      packet_loss_percent: number | null
      results: Record<string, { reachable: boolean | null; output?: string; error?: string | null }>
    }>('/connectivity-test', {
      method: 'POST',
      body: JSON.stringify({ destination_ip, count }),
    }),
  createJob: (payload: JobCreate) => request<Job>('/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  jobs: () => request<Job[]>('/jobs'),
  job: (id: string) => request<Job>(`/jobs/${id}`),
  cycles: (id: string) => request<Cycle[]>(`/jobs/${id}/cycles`),
  events: (id: string) => request<EventRecord[]>(`/jobs/${id}/events`),
  anomalies: (id: string) => request<Anomaly[]>(`/jobs/${id}/anomalies`),
  stop: (id: string) => request<Job>(`/jobs/${id}/stop`, { method: 'POST' }),
  report: (id: string, type: 'excel' | 'pdf' | 'pptx') =>
    request<{ path: string; message?: string }>(`/jobs/${id}/reports/${type}`, { method: 'POST' }),
}

export type Status = 'PENDING' | 'RUNNING' | 'PASS' | 'FAIL' | 'WARNING'
export type JobState = 'CREATED' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'COMPLETED' | 'FAILED'

export interface Device {
  serial: string
  adb_state?: string
  state?: string
  manufacturer?: string | null
  model?: string | null
  android?: string | null
  battery_percent?: number | null
  ip_address?: string | null
  rat?: string | null
  signal?: string | null
  mobile_data_enabled?: boolean | null
  ims_registered?: boolean | null
  errors?: Record<string, string>
}

export interface TestConfig {
  cycles: number
  callDuration: number
  websites: string[]
  webTest: boolean
  speedTest: boolean
  volteAB: boolean
  volteBA: boolean
  screenshots: boolean
  logcat: boolean
}

export interface JobCreate {
  ue_a_serial: string
  ue_b_serial: string
  destination_ip: string
  ping_interval_seconds: number
  cycles: number
  call_duration_seconds: number
  attach_timeout_seconds: number
  websites: string[]
  run_web_test: boolean
  run_speed_test: boolean
  run_volte_ab: boolean
  run_volte_ba: boolean
  collect_logcat: boolean
  screenshot_on_failure: boolean
}

export interface Job {
  job_id: string
  status?: string
  state: JobState
  created_at?: string
  updated_at?: string
  completed_cycles: number
  current_cycle?: number
  requested_cycles: number
  current_step?: string
  progress?: number
  elapsed_seconds?: number
  anomaly_count?: number
  latest_event?: string | null
  monitoring?: Record<string, unknown>
  error?: string | null
  config?: Record<string, unknown>
  summary?: Record<string, unknown>
}

export interface Cycle {
  cycle_number: number
  started_at: string
  completed_at?: string | null
  status: string
  steps: Array<{ name: string; success?: boolean | null }>
  attach: Record<string, unknown>
  web?: Record<string, unknown> | null
  speed?: Record<string, unknown> | null
  volte?: Record<string, unknown> | null
  error?: string | null
}

export interface EventRecord {
  timestamp?: string
  kind?: string
  event?: string
  cycle?: number
  step?: string
  status?: string
  [key: string]: unknown
}

export interface Anomaly {
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  kind: string
  message: string
  timestamp: string
  cycle_number?: number | null
}

export interface ReadinessCheck {
  name: string
  status: 'PASS' | 'FAIL'
  detail?: string
}

export interface ReadinessResult {
  ready: boolean
  checks: ReadinessCheck[]
  monitoring?: Record<string, unknown>
}

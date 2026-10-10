import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { AnomalyPanel } from '../components/AnomalyPanel'
import { CycleResults } from '../components/CycleResults'
import { DeviceCard } from '../components/DeviceCard'
import { ExecutionProgress } from '../components/ExecutionProgress'
import { LiveKPI } from '../components/LiveKPI'
import { ReadinessPanel } from '../components/ReadinessPanel'
import { ReportPanel } from '../components/ReportPanel'
import { TestConfiguration } from '../components/TestConfiguration'
import type { Anomaly, Cycle, Device, EventRecord, Job, JobCreate, ReadinessResult, TestConfig } from '../types'

const defaults: TestConfig = {
  cycles: 5,
  callDuration: 10,
  websites: [
    'https://www.google.com',
    'https://www.cloudflare.com',
    'https://www.wikipedia.org',
    'https://www.apple.com',
    'https://www.microsoft.com',
  ],
  webTest: false,
  speedTest: false,
  volteAB: false,
  volteBA: false,
  screenshots: true,
  logcat: true,
}

export default function MobilePS() {
  const [devices, setDevices] = useState<Device[]>([])
  const [ueA, setUeA] = useState('')
  const [ueB, setUeB] = useState('')
  const [statuses, setStatuses] = useState<Record<string, Device>>({})
  const [host, setHost] = useState('10.106.156.39')
  const [pingInterval, setPingInterval] = useState(1)
  const [config, setConfig] = useState(defaults)
  const [readiness, setReadiness] = useState<ReadinessResult>()
  const [connectivity, setConnectivity] = useState<string>()
  const [job, setJob] = useState<Job>()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [reportMessage, setReportMessage] = useState('')

  const refreshDevices = useCallback(() => {
    api.devices().then(list => {
      setDevices(list)
      setUeA(current => current || list[0]?.serial || '')
      setUeB(current => current || list.find(d => d.serial !== list[0]?.serial)?.serial || '')
    }).catch(e => setError(e.message))
  }, [])

  useEffect(() => { refreshDevices() }, [refreshDevices])

  useEffect(() => {
    for (const serial of [ueA, ueB].filter(Boolean)) {
      api.deviceStatus(serial).then(status => setStatuses(old => ({ ...old, [serial]: status }))).catch(() => undefined)
    }
  }, [ueA, ueB])

  const poll = useCallback(async (id: string) => {
    const [nextJob, nextCycles, nextEvents, nextAnomalies] = await Promise.all([
      api.job(id), api.cycles(id), api.events(id), api.anomalies(id),
    ])
    setJob(nextJob)
    setCycles(nextCycles)
    setEvents(nextEvents)
    setAnomalies(nextAnomalies)
    return nextJob
  }, [])

  useEffect(() => {
    if (!job || !['CREATED', 'RUNNING', 'STOPPING'].includes(job.state)) return
    const timer = window.setInterval(() => poll(job.job_id).catch(e => setError(e.message)), 1000)
    return () => window.clearInterval(timer)
  }, [job?.job_id, job?.state, poll])

  const validSelection = Boolean(ueA && ueB && ueA !== ueB)
  const running = job && ['CREATED', 'RUNNING', 'STOPPING'].includes(job.state)
  const selectedA = useMemo(() => statuses[ueA] || devices.find(d => d.serial === ueA), [statuses, devices, ueA])
  const selectedB = useMemo(() => statuses[ueB] || devices.find(d => d.serial === ueB), [statuses, devices, ueB])

  async function checkReadiness() {
    if (!validSelection) return setError('Select two different devices.')
    setBusy('readiness'); setError('')
    try { setReadiness(await api.readiness(ueA, ueB, host)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }

  async function testConnectivity() {
    setBusy('connectivity'); setConnectivity(undefined); setError('')
    try {
      const result = await api.connectivity(host, 4)
      setConnectivity(
        result.server_reachable
          ? `Reachable · ${result.latency_ms ?? '—'} ms · loss ${result.packet_loss_percent ?? '—'}%`
          : `Unreachable · ${result.packet_loss_percent ?? 100}% loss`,
      )
    } catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }

  async function start() {
    if (!validSelection) return setError('Select two different devices.')
    const payload: JobCreate = {
      ue_a_serial: ueA,
      ue_b_serial: ueB,
      destination_ip: host,
      ping_interval_seconds: pingInterval,
      cycles: config.cycles,
      call_duration_seconds: config.callDuration,
      attach_timeout_seconds: 120,
      websites: config.websites,
      run_web_test: config.webTest,
      run_speed_test: config.speedTest,
      run_volte_ab: config.volteAB,
      run_volte_ba: config.volteBA,
      collect_logcat: config.logcat,
      screenshot_on_failure: config.screenshots,
    }
    setBusy('start'); setError(''); setCycles([]); setEvents([]); setAnomalies([])
    try { setJob(await api.createJob(payload)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }

  async function stop() {
    if (!job) return
    setBusy('stop')
    try { setJob(await api.stop(job.job_id)) }
    catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }

  async function report(type: 'excel' | 'pdf' | 'pptx') {
    if (!job) return
    setBusy(type)
    try {
      const result = await api.report(job.job_id, type)
      setReportMessage(`${result.message || 'Report generated'} · ${result.path}`)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy('') }
  }

  return (
    <main>
      <header>
        <div>
          <span className="eyebrow">Packet core upgrade validation</span>
          <h1>Lab AI Mission Control <em>·</em> Mobile PS Engineer</h1>
        </div>
        <div className="live-indicator"><i /> LAB ONLINE</div>
      </header>
      {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      <section className="panel">
        <div className="section-title">
          <div><span className="eyebrow">ADB inventory</span><h2>Device Status</h2></div>
          <button className="secondary" type="button" onClick={refreshDevices}>Refresh devices</button>
        </div>
        <div className="device-selects">
          <label>UE-A · Active test device
            <select value={ueA} onChange={e => setUeA(e.target.value)}>
              <option value="">Select device</option>
              {devices.map(d => <option disabled={d.serial === ueB} key={d.serial} value={d.serial}>{d.serial}{d.model ? ` · ${d.model}` : ''}</option>)}
            </select>
          </label>
          <label>UE-B · Continuous monitor (never airplane)
            <select value={ueB} onChange={e => setUeB(e.target.value)}>
              <option value="">Select device</option>
              {devices.map(d => <option disabled={d.serial === ueA} key={d.serial} value={d.serial}>{d.serial}{d.model ? ` · ${d.model}` : ''}</option>)}
            </select>
          </label>
        </div>
        <div className="two-col">
          <DeviceCard role="UE-A · ACTIVE TEST DEVICE" device={selectedA} />
          <DeviceCard role="UE-B · CONTINUOUS MONITOR" device={selectedB} />
        </div>
      </section>

      <section className="panel compact">
        <div><span className="eyebrow">Continuous reachability</span><h2>Monitoring Server</h2></div>
        <div className="monitor-form">
          <label>Destination / Monitoring Server IP<input value={host} onChange={e => setHost(e.target.value)} placeholder="10.106.156.39" /></label>
          <label>Ping interval
            <select value={pingInterval} onChange={e => setPingInterval(+e.target.value)}>
              {[1, 2, 5].map(n => <option key={n} value={n}>{n} second{n > 1 ? 's' : ''}</option>)}
            </select>
          </label>
          <button className="secondary" onClick={testConnectivity} disabled={busy === 'connectivity'}>
            {busy === 'connectivity' ? 'TESTING…' : 'TEST CONNECTIVITY'}
          </button>
          {connectivity && <span className={`status ${connectivity.startsWith('Reachable') ? 'pass' : 'fail'}`}>{connectivity}</span>}
        </div>
      </section>

      <TestConfiguration value={config} onChange={setConfig} />
      <ReadinessPanel loading={busy === 'readiness'} result={readiness} onCheck={checkReadiness} />

      <section className="run-control">
        <div>
          <span className="eyebrow">Active job</span>
          <strong>{job?.job_id || 'No job started'}</strong>
          {job?.current_step && <span className="muted"> · {job.current_step}</span>}
        </div>
        <div className="action-row">
          <button className="primary" onClick={start} disabled={!validSelection || !!running || busy === 'start'}>
            {busy === 'start' ? 'STARTING…' : 'START TEST'}
          </button>
          <button className="danger-button" onClick={stop} disabled={!running || busy === 'stop'}>
            {busy === 'stop' ? 'STOPPING…' : 'STOP TEST'}
          </button>
        </div>
      </section>

      <ExecutionProgress job={job} events={events} />
      <LiveKPI job={job} cycles={cycles} anomalies={anomalies} />
      <CycleResults cycles={cycles} />
      <AnomalyPanel anomalies={anomalies} />
      <ReportPanel
        disabled={!job || !!running}
        busy={['excel', 'pdf', 'pptx'].includes(busy) ? busy : undefined}
        message={reportMessage}
        onGenerate={report}
      />
      <footer>Mobile PS V1 · Deterministic Python / ADB · Web·Speed·VoLTE mocked until V2–V3 · Reports stub until V4</footer>
    </main>
  )
}

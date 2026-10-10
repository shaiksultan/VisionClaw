import type { EventRecord, Job, Status } from '../types'

const steps = [
  ['airplane_on_start', 'Airplane ON'], ['airplane_off', 'Airplane OFF'], ['attach', 'Attach'], ['web', 'Web'], ['speed', 'Speed'],
  ['volte_ab', 'VoLTE A→B'], ['volte_ba', 'VoLTE B→A'], ['airplane_on_end', 'Airplane ON'], ['complete', 'Complete'],
] as const

export function ExecutionProgress({ job, events }: { job?: Job; events: EventRecord[] }) {
  const currentCycle = job ? Math.min(job.completed_cycles + 1, job.requested_cycles) : 0
  const latest = events.filter(e => e.cycle === currentCycle)
  const complete = latest.some(e => e.kind === 'CYCLE_COMPLETED')
  const statusFor = (key: string): Status => {
    if (!job) return 'PENDING'
    if (key === 'complete') return complete ? 'PASS' : job.state === 'FAILED' ? 'FAIL' : 'PENDING'
    const event = latest.find(e => e.step === key)
    if (event) return (event.result as { disconnected?: boolean; error?: string } | undefined)?.error ? 'WARNING' : 'PASS'
    if (job.state === 'RUNNING' && key === steps.find(([id]) => !latest.some(e => e.step === id))?.[0]) return 'RUNNING'
    return 'PENDING'
  }
  return <section className="panel"><div className="section-title"><div><span className="eyebrow">Execution workflow</span><h2>Cycle {currentCycle || '—'} Sequence</h2></div><span className={`status ${(job?.state || '').toLowerCase()}`}>{job?.state || 'IDLE'}</span></div>
    <div className="workflow">{steps.map(([key, label], index) => <div className={`workflow-step ${statusFor(key).toLowerCase()}`} key={key}><span className="step-index">{String(index + 1).padStart(2, '0')}</span><strong>{label}</strong><small>{statusFor(key)}</small></div>)}</div>
  </section>
}

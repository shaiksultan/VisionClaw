import type { Anomaly, Cycle, Job } from '../types'

export function LiveKPI({ job, cycles, anomalies }: { job?: Job; cycles: Cycle[]; anomalies: Anomaly[] }) {
  const attach = cycles.map(c => c.attach?.attach_seconds).filter((v): v is number => typeof v === 'number')
  const passed = cycles.filter(c => c.status === 'COMPLETED').length
  const kpis = [
    ['Progress', job ? `${job.completed_cycles} / ${job.requested_cycles}` : '—'],
    ['Cycle pass rate', cycles.length ? `${Math.round(passed / cycles.length * 100)}%` : '—'],
    ['Mean attach', attach.length ? `${(attach.reduce((a, b) => a + b, 0) / attach.length).toFixed(2)}s` : '—'],
    ['Anomalies', String(anomalies.length)],
  ]
  return <section className="kpi-grid">{kpis.map(([label, value]) => <article className="kpi" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
}

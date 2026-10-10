import type { Anomaly } from '../types'

export function AnomalyPanel({ anomalies }: { anomalies: Anomaly[] }) {
  return <section className="panel"><div className="section-title"><div><span className="eyebrow">Signal watch</span><h2>Anomalies</h2></div><span className={`status ${anomalies.length ? 'warning' : 'pass'}`}>{anomalies.length ? `${anomalies.length} DETECTED` : 'CLEAR'}</span></div>
    <div className="anomaly-list">{anomalies.length ? anomalies.map((a, i) => <article className="anomaly" key={`${a.timestamp}-${i}`}><span className={`severity ${a.severity.toLowerCase()}`}>{a.severity}</span><div><strong>{a.kind}</strong><p>{a.message}</p><small>{a.cycle_number ? `Cycle ${a.cycle_number} · ` : ''}{new Date(a.timestamp).toLocaleString()}</small></div></article>) : <p className="empty">No anomalies recorded.</p>}</div>
  </section>
}

import type { Cycle } from '../types'

function result(value: Record<string, unknown> | null | undefined, key?: string) {
  if (!value) return '—'
  if (key && value[key] != null) return String(value[key])
  if (value.error) return 'FAIL'
  return 'PASS'
}

export function CycleResults({ cycles }: { cycles: Cycle[] }) {
  return <section className="panel"><div className="section-title"><div><span className="eyebrow">Run history</span><h2>Cycle Results</h2></div><span className="muted">{cycles.length} recorded</span></div>
    <div className="table-wrap"><table><thead><tr><th>Cycle</th><th>Status</th><th>Attach</th><th>Web</th><th>Speed</th><th>VoLTE</th><th>Completed</th></tr></thead>
      <tbody>{cycles.length ? cycles.map(c => <tr key={c.cycle_number}><td>#{c.cycle_number}</td><td><span className={`status ${c.status === 'COMPLETED' ? 'pass' : c.status.toLowerCase()}`}>{c.status}</span></td><td>{result(c.attach, 'attach_seconds')}</td><td>{result(c.web)}</td><td>{result(c.speed)}</td><td>{result(c.volte)}</td><td>{c.completed_at ? new Date(c.completed_at).toLocaleTimeString() : '—'}</td></tr>) : <tr><td colSpan={7} className="empty">No cycle results yet</td></tr>}</tbody>
    </table></div>
  </section>
}

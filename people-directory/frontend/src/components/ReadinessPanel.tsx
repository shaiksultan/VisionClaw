import type { ReadinessResult } from '../types'

export function ReadinessPanel({
  loading,
  result,
  onCheck,
}: {
  loading: boolean
  result?: ReadinessResult
  onCheck: () => void
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">Pre-flight gate</span>
          <h2>Pre-Test Readiness</h2>
          <p className="muted">Validate ADB, UE-B protection constraints, network state, monitoring server, and job storage.</p>
        </div>
        <button className="secondary" onClick={onCheck} disabled={loading}>
          {loading ? 'CHECKING…' : 'CHECK READINESS'}
        </button>
      </div>
      {result && (
        <>
          <span className={`status ${result.ready ? 'pass' : 'fail'}`}>{result.ready ? 'READY' : 'NOT READY'}</span>
          <div className="check-list">
            {result.checks.map(check => (
              <div className="check-row" key={check.name}>
                <span className={`status ${check.status === 'PASS' ? 'pass' : 'fail'}`}>{check.status}</span>
                <strong>{check.name}</strong>
                <span className="muted">{check.detail || ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

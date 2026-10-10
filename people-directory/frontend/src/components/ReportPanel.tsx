export function ReportPanel({ disabled, busy, message, onGenerate }: { disabled: boolean; busy?: string; message?: string; onGenerate: (type: 'excel' | 'pdf' | 'pptx') => void }) {
  return <section className="panel compact"><div><span className="eyebrow">Deliverables</span><h2>Reports</h2><p className="muted">{message || 'Generate an execution package from the active job.'}</p></div>
    <div className="action-row">{(['excel', 'pdf', 'pptx'] as const).map(type => <button className="secondary" disabled={disabled || !!busy} onClick={() => onGenerate(type)} key={type}>{busy === type ? 'GENERATING…' : `EXPORT ${type.toUpperCase()}`}</button>)}</div>
  </section>
}

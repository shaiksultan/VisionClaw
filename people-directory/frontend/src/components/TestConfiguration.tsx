import type { TestConfig } from '../types'

export function TestConfiguration({ value, onChange }: { value: TestConfig; onChange: (next: TestConfig) => void }) {
  const patch = (next: Partial<TestConfig>) => onChange({ ...value, ...next })
  const toggle = (key: keyof TestConfig, label: string) => <label className="toggle"><input type="checkbox" checked={Boolean(value[key])} onChange={e => patch({ [key]: e.target.checked })} /><span />{label}</label>
  return <section className="panel">
    <div className="section-title"><div><span className="eyebrow">Test plan</span><h2>Test Configuration</h2></div></div>
    <div className="form-grid">
      <label>Cycles<input type="number" min="1" max="10000" value={value.cycles} onChange={e => patch({ cycles: +e.target.value })} /></label>
      <label>Call duration (seconds)<input type="number" min="1" value={value.callDuration} onChange={e => patch({ callDuration: +e.target.value })} /></label>
      <label className="wide">Websites (1–5, comma separated)<input value={value.websites.join(', ')} onChange={e => patch({ websites: e.target.value.split(',').map(x => x.trim()).filter(Boolean).slice(0, 5) })} /></label>
    </div>
    <div className="toggle-grid">
      {toggle('webTest', 'Web (laptop → UE-A USB tether)')}{toggle('speedTest', 'Speedtest (laptop → UE-A USB tether)')}{toggle('volteAB', 'VoLTE A → B')}{toggle('volteBA', 'VoLTE B → A')}
      {toggle('screenshots', 'Capture screenshots')}{toggle('logcat', 'Capture logcat')}
    </div>
    <p className="muted" style={{ marginTop: 12 }}>
      Web and Speedtest traffic is generated on this laptop and forced out the USB-tether NIC (UE-A mobile data). Not run via ADB on the phone.
    </p>
  </section>
}

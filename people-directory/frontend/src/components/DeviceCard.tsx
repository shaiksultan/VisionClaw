import type { Device } from '../types'

export function DeviceCard({ role, device }: { role: string; device?: Device }) {
  const online = (device?.adb_state || device?.state) === 'device'
  const fields = [
    ['Manufacturer', device?.manufacturer],
    ['Model', device?.model],
    ['Android', device?.android],
    ['Battery', device?.battery_percent == null ? null : `${device.battery_percent}%`],
    ['IP address', device?.ip_address],
    ['RAT', device?.rat],
    ['Signal', device?.signal],
    ['Mobile data', device?.mobile_data_enabled == null ? null : device.mobile_data_enabled ? 'Enabled' : 'Disabled'],
    ['IMS', device?.ims_registered == null ? null : device.ims_registered ? 'Registered' : 'Not registered'],
  ]
  return <article className="card device-card">
    <div className="card-head"><div><span className="eyebrow">{role}</span><h3>{device?.serial || 'Not selected'}</h3></div><span className={`status ${online ? 'pass' : 'fail'}`}>{online ? 'CONNECTED' : 'OFFLINE'}</span></div>
    <dl>{fields.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}</dl>
  </article>
}

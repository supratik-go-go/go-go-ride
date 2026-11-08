import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { assetUrl } from '../../api/client'
import { Badge, Button, DataTable, SectionHeader, useToast } from '../../components/ui'
import { adminService } from '../../services'
import './admin.css'

const SAMPLE = '/download/bus-import-template.xlsx'

const ACTION = {
  create: { tone: 'success', text: 'New bus' },
  update: { tone: 'primary', text: 'Update' },
  error: { tone: 'danger', text: 'Problem' },
}

const columns = [
  { key: 'row', header: 'Row', width: 60, render: (r) => r.row },
  {
    key: 'bus',
    header: 'Bus',
    render: (r) => (
      <div className="adm-cell">
        <span className="adm-cell-main">{r.busNumber || '-'}</span>
        {r.busName && <span className="adm-cell-sub">{r.busName}</span>}
      </div>
    ),
  },
  { key: 'action', header: 'What happens', render: (r) => <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].text}</Badge> },
  {
    key: 'stops',
    header: 'Stops',
    render: (r) =>
      r.stops.length ? (
        <div className="adm-cell">
          <span className="adm-cell-main">
            {r.stops[0].name} {r.stops[0].time} → {r.stops[r.stops.length - 1].name} {r.stops[r.stops.length - 1].time}
          </span>
          <span className="adm-cell-sub">
            {r.stops.length} stops
            {r.stops.some((s) => s.isNew) && ` · new: ${r.stops.filter((s) => s.isNew).map((s) => s.name).join(', ')}`}
          </span>
        </div>
      ) : (
        '-'
      ),
  },
  {
    key: 'errors',
    header: 'Problems',
    render: (r) => (r.errors.length ? <span className="text-danger text-sm">{r.errors.join('. ')}</span> : <span className="text-muted">-</span>),
  },
]

/** Admin: add or update many buses at once from the Excel sheet. */
export default function BusImport() {
  const toast = useToast()
  const [file, setFile] = useState(null)
  const [check, setCheck] = useState(null)
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState(null)

  const pick = (e) => {
    setFile(e.target.files?.[0] || null)
    setCheck(null)
    setDone(null)
  }

  const run = async (apply) => {
    setBusy(apply ? 'import' : 'check')
    try {
      const result = await adminService.importBuses(file, { apply, publish })
      if (apply) {
        setDone(result.applied)
        setCheck(null)
        toast.success(`${result.applied.created} added, ${result.applied.updated} updated`)
      } else {
        setCheck(result)
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy('')
    }
  }

  const ready = check ? check.summary.create + check.summary.update : 0

  return (
    <div className="adm-page">
      <SectionHeader
        title="Import buses from Excel"
        subtitle="Add many buses at once, or update buses that are already listed."
        actions={
          <Button variant="outline" icon={<ArrowLeft size={17} />} to="/admin/buses">
            Back to buses
          </Button>
        }
      />

      <section className="adm-card stack" style={{ '--gap': '14px', padding: 18 }}>
        <ol className="stack text-sm" style={{ '--gap': '6px', margin: 0, paddingLeft: 20 }}>
          <li>
            Download the sample sheet and fill it in: one row for each bus, with all its stops and times in one cell.{' '}
            <a href={assetUrl(SAMPLE)} target="_blank" rel="noopener noreferrer">
              <Download size={14} style={{ verticalAlign: '-2px' }} /> Sample sheet
            </a>
          </li>
          <li>A bus number that is already listed updates that bus instead of adding a new one.</li>
          <li>Choose the file and tap Check file. Nothing is saved until you tap Import.</li>
        </ol>

        <label className="row wrap" style={{ '--gap': '10px' }}>
          <FileSpreadsheet size={20} className="text-primary" />
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pick} aria-label="Excel file" />
        </label>

        <div className="row wrap" style={{ '--gap': '10px' }}>
          <Button icon={<Upload size={17} />} onClick={() => run(false)} disabled={!file || Boolean(busy)} loading={busy === 'check'}>
            Check file
          </Button>
        </div>
      </section>

      {done && (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          <span>
            Import finished: {done.created} added, {done.updated} updated{done.skipped ? `, ${done.skipped} rows with problems skipped` : ''}.{' '}
            {!publish && done.created > 0 && 'New buses are waiting in Bus Requests.'}
          </span>
        </div>
      )}

      {check && (
        <section className="adm-card adm-table-card">
          <div className="row wrap" style={{ '--gap': '8px', padding: '14px 16px' }}>
            <Badge tone="success">{check.summary.create} new</Badge>
            <Badge tone="primary">{check.summary.update} updates</Badge>
            <Badge tone={check.summary.error ? 'danger' : 'neutral'}>{check.summary.error} with problems</Badge>
          </div>
          <DataTable columns={columns} rows={check.rows} rowKey="row" noun="rows" empty={{ title: 'The sheet has no buses', message: 'Fill in at least one row below the headers.' }} />
          <div className="stack" style={{ '--gap': '10px', padding: 16 }}>
            {check.summary.error > 0 && <p className="text-sm text-muted">Rows with problems will be skipped. Fix them in Excel and import again any time.</p>}
            <label className="checkbox">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              <span>Make new buses live straight away (untick to send them to Bus Requests first)</span>
            </label>
            <div>
              <Button onClick={() => run(true)} disabled={!ready || Boolean(busy)} loading={busy === 'import'}>
                Import {ready} {ready === 1 ? 'bus' : 'buses'}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

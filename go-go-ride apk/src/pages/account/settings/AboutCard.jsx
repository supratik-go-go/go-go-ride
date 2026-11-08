import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, CircleHelp, FileText, Info, Mail, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, Modal } from '../../../components/ui'

const APP_VERSION = __APP_VERSION__

const LEGAL = {
  terms: {
    title: 'Terms of use',
    body: [
      'GO-GO Ride helps you find local buses, set arrival reminders, book seats and contact local drivers in West Bengal.',
      'Timetables come from bus operators and are reviewed by our team, but traffic and operator changes mean buses can run early or late. Estimated positions are not live GPS.',
      'Local car fares are agreed directly between you and the driver. Shared ride and bus fares shown at booking are calculated by GO-GO Ride.',
      'Please use the service lawfully and do not post false listings or reviews. We may suspend accounts that misuse the platform.',
    ],
  },
}

/** About, contact, help and the legal pages, with the installed version. */
export function AboutCard() {
  const [legal, setLegal] = useState(null)
  const doc = legal ? LEGAL[legal] : null

  return (
    <Card>
      <div className="acc-setting-head">
        <span className="icon-tile violet">
          <Info size={20} />
        </span>
        <div className="grow">
          <h2>About GO-GO Ride</h2>
          <p>Smart local transport for West Bengal</p>
        </div>
        <Badge tone="neutral" square>
          v{APP_VERSION}
        </Badge>
      </div>
      <nav className="acc-links" aria-label="About and legal">
        <Link to="/about">
          <Info size={18} /> About us <ChevronRight size={18} className="acc-menu-chevron" />
        </Link>
        <Link to="/contact">
          <Mail size={18} /> Contact us <ChevronRight size={18} className="acc-menu-chevron" />
        </Link>
        <Link to="/support">
          <CircleHelp size={18} /> Help &amp; Support <ChevronRight size={18} className="acc-menu-chevron" />
        </Link>
        <button type="button" onClick={() => setLegal('terms')}>
          <FileText size={18} /> Terms of use <ChevronRight size={18} className="acc-menu-chevron" />
        </button>
        <a href="https://go-goride.com/privacy" target="_blank" rel="noopener noreferrer">
          <ShieldCheck size={18} /> Privacy policy <ChevronRight size={18} className="acc-menu-chevron" />
        </a>
      </nav>

      <Modal
        open={Boolean(doc)}
        onClose={() => setLegal(null)}
        title={doc?.title}
        footer={<Button onClick={() => setLegal(null)}>Got it</Button>}
      >
        <div className="stack" style={{ '--gap': '10px' }}>
          {doc?.body.map((p) => (
            <p key={p} className="text-sm text-2">
              {p}
            </p>
          ))}
        </div>
      </Modal>
    </Card>
  )
}

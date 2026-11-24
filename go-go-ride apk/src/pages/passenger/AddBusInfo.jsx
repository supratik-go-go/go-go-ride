import { Link } from 'react-router-dom'
import { Camera, ChevronRight, ClipboardList } from 'lucide-react'
import { PageHeader } from '../../components/ui'
import './passenger.css'
import './extras.css'

/** Add Bus Info: fill the form, or just send a photo of the bus ticket (owner's design, v1.11). */
export default function AddBusInfo() {
  return (
    <div className="px-page px-narrow">
      <PageHeader title="Add Bus Information" subtitle="Help others find this bus" />
      <div className="stack" style={{ '--gap': '14px' }}>
        <Link to="/owner/buses/new" className="card px-addbus-way">
          <span className="icon-tile" aria-hidden="true">
            <ClipboardList size={24} />
          </span>
          <span className="px-x-call-text">
            <span className="px-addbus-title">1. Manually</span>
            <span className="px-x-call-sub">Give the bus details in a form: name, stops and times.</span>
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>

        <span className="px-addbus-or">Or</span>

        <Link to="/add-bus/ticket" className="card px-addbus-way is-easy">
          <span className="icon-tile accent" aria-hidden="true">
            <Camera size={24} />
          </span>
          <span className="px-x-call-text">
            <span className="px-addbus-title">2. Upload your ticket photo 🎫</span>
            <span className="px-x-call-sub">Just take a photo of your bus ticket. Our team reads it and adds the bus.</span>
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}

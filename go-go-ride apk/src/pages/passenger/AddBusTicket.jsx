import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Image as ImageIcon, Send, Ticket } from 'lucide-react'
import { Button, PageHeader, Textarea, useToast } from '../../components/ui'
import { communityService } from '../../services'
import { shrinkPhoto } from '../../utils/shrinkPhoto'
import './passenger.css'
import './extras.css'

/** Upload Your Bus Ticket: a photo (camera or gallery) and an optional note, for the team to read. */
export default function AddBusTicket() {
  const toast = useToast()
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.warning('Choose a photo of the ticket.')
      return
    }
    const small = await shrinkPhoto(file, { name: 'ticket.jpg' })
    setPhoto(small)
    setPreview(URL.createObjectURL(small))
  }

  const submit = async () => {
    if (!photo) {
      toast.warning('Take or choose a photo of the ticket first.')
      return
    }
    setBusy(true)
    try {
      await communityService.sendTicketPhoto(photo, note.trim())
      setSent(true)
    } catch (err) {
      toast.error(err)
    } finally {
      setBusy(false)
    }
  }

  const again = () => {
    setSent(false)
    setPhoto(null)
    setPreview('')
    setNote('')
  }

  if (sent) {
    return (
      <div className="px-page px-narrow">
        <PageHeader title="Add Bus Information" />
        <div className="card px-ticket-done">
          <CheckCircle2 size={44} className="text-success" />
          <h2>Thank you!</h2>
          <p className="text-2">Our team will read your ticket and add the bus. You&apos;ll get a notification when it helps.</p>
          <div className="stack" style={{ '--gap': '10px', width: '100%' }}>
            <Button block onClick={again} icon={<Ticket size={18} />}>
              Send another ticket
            </Button>
            <Button block variant="soft" to="/home">
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-page px-narrow">
      <PageHeader title="Add Bus Information" subtitle="Upload your bus ticket" />
      <div className="stack" style={{ '--gap': '14px' }}>
        <section className="card px-ticket-box">
          <h2 className="px-addbus-title">
            <Ticket size={20} className="text-accent" /> Upload Your Bus Ticket
          </h2>
          <div className="px-ticket-photo">
            {preview ? (
              <img src={preview} alt="Your ticket photo" />
            ) : (
              <span className="px-ticket-empty">
                <Ticket size={40} />
                <span className="text-sm text-muted">Bus no., from, to, date, time and fare on the ticket help most.</span>
              </span>
            )}
          </div>
          <div className="px-ticket-actions">
            <Button variant="success" icon={<Camera size={18} />} onClick={() => cameraRef.current?.click()}>
              {photo ? 'Take again' : 'Take a Photo'}
            </Button>
            <Button variant="accent" icon={<ImageIcon size={18} />} onClick={() => galleryRef.current?.click()}>
              Choose from Gallery
            </Button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
          <input ref={galleryRef} type="file" accept="image/*" hidden onChange={pick} />
        </section>

        <Textarea
          label="Note"
          placeholder="আপনার মতামত জানাতে পারেন (anything to add, e.g. the bus name)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
        />

        <Button variant="success" size="lg" block loading={busy} icon={<Send size={18} />} onClick={submit}>
          Submit Ticket
        </Button>
      </div>
    </div>
  )
}

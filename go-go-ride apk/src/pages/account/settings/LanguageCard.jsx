import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Badge } from '../../../components/ui'

/** Only English for now; Bengali is shown so people know it is planned. */
export function LanguageCard() {
  return (
    <>
      <div className="card acc-menu" role="radiogroup" aria-label="Language">
        <button type="button" role="radio" aria-checked="true" className="acc-menu-row acc-choice">
          <span className="acc-menu-label">
            English
            <small>The app&apos;s language</small>
          </span>
          <span className="acc-choice-mark">
            <Check size={15} strokeWidth={3} />
          </span>
        </button>
        <button type="button" role="radio" aria-checked="false" className="acc-menu-row acc-choice" disabled>
          <span className="acc-menu-label">
            <span lang="bn">বাংলা</span>
            <small>Bengali</small>
          </span>
          <Badge tone="accent" square>
            Coming soon
          </Badge>
        </button>
      </div>
      <p className="acc-set-note">
        <Link to="/news">Daily News</Link> already has stories in Bengali.
      </p>
    </>
  )
}

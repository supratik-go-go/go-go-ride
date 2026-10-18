import { useEffect, useState } from 'react'
import { LogIn, MessageSquareText, Send } from 'lucide-react'
import { Avatar, StarRating } from '../ui/Misc'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Input'
import { EmptyState } from '../ui/States'
import { timeAgo } from '../../utils/format'
import { useAuth } from '../../context/AuthContext'
import { useRequireLogin } from './helpers'
import './passenger-ui.css'

const RATING_WORDS = ['', 'Poor', 'Below average', 'Good', 'Very good', 'Excellent']

export function ReviewItem({ review, mine }) {
  const name = review.user?.name || 'GO-GO Ride user'
  return (
    <li className="px-review">
      <Avatar src={review.user?.avatarUrl} name={name} size={38} />
      <div className="px-review-body">
        <div className="px-review-head">
          <span className="fw-600 text-sm">
            {name}
            {mine && <span className="badge badge-primary" style={{ marginLeft: 8 }}>You</span>}
          </span>
          <span className="text-xs text-muted">{timeAgo(review.createdAt)}</span>
        </div>
        <StarRating value={review.rating} size={14} />
        {review.comment && <p className="px-review-comment">{review.comment}</p>}
      </div>
    </li>
  )
}

/** Plain list of reviews with an empty state. */
export function ReviewList({ reviews, emptyMessage = 'Be the first to share your experience.' }) {
  const { user } = useAuth()
  if (!reviews?.length) {
    return <EmptyState compact icon={<MessageSquareText size={24} />} title="No reviews yet" message={emptyMessage} />
  }
  return (
    <ul className="list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {reviews.map((r) => (
        <ReviewItem key={r.id} review={r} mine={user && r.user?.id === user.id} />
      ))}
    </ul>
  )
}

/**
 * Star + comment form. `onSubmit(rating, comment)` must return a promise and
 * throw ApiError on failure (field errors are shown inline).
 * Signed-out users see a sign-in prompt instead.
 */
export function ReviewForm({ onSubmit, initialRating = 0, initialComment = '', title = 'Write a review', submitLabel = 'Submit review', isUpdate }) {
  const { isAuthenticated } = useAuth()
  const requireLogin = useRequireLogin()
  const [rating, setRating] = useState(initialRating)
  const [comment, setComment] = useState(initialComment)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setRating(initialRating)
    setComment(initialComment)
  }, [initialRating, initialComment])

  if (!isAuthenticated) {
    return (
      <div className="soft-panel row-between wrap">
        <span className="text-sm text-2">Sign in to rate and review.</span>
        <Button size="sm" icon={<LogIn size={16} />} onClick={() => requireLogin()}>
          Sign in
        </Button>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!rating) {
      setErrors({ rating: 'Tap a star to choose your rating' })
      return
    }
    if (comment.length > 500) {
      setErrors({ comment: 'Keep your review under 500 characters' })
      return
    }
    setBusy(true)
    setErrors({})
    try {
      await onSubmit(rating, comment.trim() || undefined)
    } catch (err) {
      setErrors(err?.fieldErrors || {})
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="px-review-form" onSubmit={submit} noValidate>
      <div className="field">
        <span className="field-label">{isUpdate ? 'Update your review' : title}</span>
        <div className="px-stars-input">
          <StarRating value={rating} size={28} onChange={(v) => setRating(v)} />
          {rating > 0 && <span className="text-sm fw-600 text-primary">{RATING_WORDS[rating]}</span>}
        </div>
        {errors.rating && <span className="field-error">{errors.rating}</span>}
      </div>
      <Textarea
        label="Comment"
        placeholder="What was good? What could be better?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        error={errors.comment}
        maxLength={500}
        hint={`${comment.length}/500`}
      />
      <Button type="submit" icon={<Send size={16} />} loading={busy} style={{ alignSelf: 'flex-start' }}>
        {isUpdate ? 'Update review' : submitLabel}
      </Button>
    </form>
  )
}

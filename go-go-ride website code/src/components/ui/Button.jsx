import { Link } from 'react-router-dom'
import { Spinner } from './LoadingSpinner'

const cx = (...c) => c.filter(Boolean).join(' ')

/**
 * <Button variant="primary|accent|outline|ghost|soft|danger|success|white|outline-accent|outline-danger"
 *         size="sm|md|lg" block loading icon={<Search size={18}/>} to="/path" href="tel:..">
 */
export function Button({
  variant = 'primary',
  size = 'md',
  block,
  loading,
  icon,
  iconRight,
  to,
  href,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', !children && 'btn-icon', className)
  const content = (
    <>
      {loading ? <Spinner size={16} /> : icon}
      {children}
      {!loading && iconRight}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    )
  }
  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  )
}

export function IconButton({ label, children, badge, className, ...rest }) {
  return (
    <button type="button" className={cx('icon-btn', className)} aria-label={label} title={label} {...rest}>
      {children}
      {badge ? <span className="icon-btn-badge">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  )
}

import { Link, useLocation } from 'react-router-dom'
import { House, Search, SignpostBig } from 'lucide-react'
import { Button, Logo } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import busSide from '../../assets/brand/bus-side.jpg'
import './public.css'

/** Standalone 404 (no layout). */
export default function NotFound() {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()
  return (
    <div className="pub-404">
      <div className="pub-404-card">
        <Link to={isAuthenticated ? '/home' : '/'} aria-label="GO-GO Ride home">
          <Logo height={64} />
        </Link>
        <div className="pub-404-art" aria-hidden="true">
          <span className="pub-404-code">
            4<SignpostBig size={64} strokeWidth={1.6} />4
          </span>
          <img src={busSide} alt="" />
        </div>
        <h1>This stop isn&apos;t on our route</h1>
        <p className="text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back on track.
        </p>
        {pathname && pathname !== '/' && <code className="pub-404-path">{pathname}</code>}
        <div className="pub-404-actions">
          <Button to={isAuthenticated ? '/home' : '/'} size="lg" icon={<House size={18} />}>
            Home
          </Button>
          <Button to="/search" variant="accent" size="lg" icon={<Search size={18} />}>
            Search buses
          </Button>
        </div>
        <p className="text-sm text-muted">
          Think something&apos;s broken? <Link to="/contact">Tell us</Link>
        </p>
      </div>
    </div>
  )
}

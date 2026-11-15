import { Component } from 'react'
import { AlertTriangle, House, RefreshCw } from 'lucide-react'
import { Button } from './Button'

/**
 * Catches a crash in the screens inside it, so the user gets a way out instead of a blank page.
 * `resetKey` (the current path) clears the error when the user moves to another screen.
 * Both buttons reload the page, which also clears any bad state the crash left behind.
 */
export class ErrorBoundary extends Component {
  state = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  componentDidCatch(error, info) {
    console.error('[crash]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    const home = this.props.home || '/home'
    return (
      <div className="state-box" role="alert" style={{ minHeight: '50vh' }}>
        <div className="icon-tile lg round danger">
          <AlertTriangle size={26} />
        </div>
        <h4>Something went wrong</h4>
        <p className="text-sm text-muted">This screen could not open. Please reload, or go back to the home screen.</p>
        <div className="row wrap" style={{ '--gap': '8px', justifyContent: 'center' }}>
          <Button variant="outline" size="sm" icon={<RefreshCw size={15} />} onClick={() => window.location.reload()}>
            Reload
          </Button>
          <Button size="sm" icon={<House size={15} />} onClick={() => window.location.assign(home)}>
            Go to Home
          </Button>
        </div>
      </div>
    )
  }
}

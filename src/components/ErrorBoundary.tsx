import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Shows what went wrong instead of a blank screen, with a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="content error-screen" dir="ltr">
        <h2>⚠ Something went wrong / کچھ غلط ہو گیا</h2>
        <p>Please take a screenshot of this screen and send it to the app developer. Your records are safe.</p>
        <pre className="error-text">
          {error.name}: {error.message}
          {'\n'}
          {(error.stack ?? '').split('\n').slice(0, 6).join('\n')}
          {'\n'}
          {location.hash} · {navigator.userAgent}
        </pre>
        <button className="btn btn-primary btn-block" onClick={() => location.reload()}>
          Reload / دوبارہ کھولیں
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => { location.hash = '#/'; location.reload() }}>
          Home / ہوم
        </button>
      </div>
    )
  }
}

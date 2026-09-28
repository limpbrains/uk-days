import { Component, type ReactNode } from 'react'

interface Props {
  /** Re-mount key: when it changes the boundary clears its error. */
  resetKey: string
  message: string
  actionLabel: string
  onAction: () => void
  children: ReactNode
}

interface State {
  error: Error | null
  resetKey: string
}

/** Keeps a bad profile (corrupt storage, unforeseen input) from blanking the whole page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card banner" role="alert">
        <p>{this.props.message}</p>
        <pre className="json">{String(this.state.error.message)}</pre>
        <button type="button" className="btn danger" onClick={() => { this.props.onAction(); this.setState({ error: null }) }}>
          {this.props.actionLabel}
        </button>
      </div>
    )
  }
}

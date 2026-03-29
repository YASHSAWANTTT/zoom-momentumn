import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message || 'Something went wrong' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <div className="card" style={{ textAlign: 'left', maxWidth: 420 }}>
            <p style={{ color: 'var(--zoom-error)', fontWeight: 600 }}>Something went wrong</p>
            <p style={{ color: 'var(--zoom-text-secondary)', fontSize: 13, marginTop: 8 }}>
              {this.state.message}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => this.setState({ hasError: false, message: '' })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

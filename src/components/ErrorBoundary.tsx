import { Component, type ReactNode } from 'react'
import { Button } from './ui'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-cream">
          <div className="max-w-md w-full bg-white rounded-[32px] shadow-floating p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-sunset/20 flex items-center justify-center">
              <svg
                className="w-10 h-10 text-sunset"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="font-display text-2xl text-cocoa mb-2">
              Oeps, er ging iets mis
            </h1>

            <p className="text-cocoa-light mb-6">
              Er is een onverwachte fout opgetreden. Je kunt proberen de pagina te
              herladen of terug te gaan naar de startpagina.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-sm text-cocoa-light cursor-pointer hover:text-cocoa">
                  Technische details
                </summary>
                <pre className="mt-2 p-3 bg-cream rounded-lg text-xs text-cocoa overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" onClick={this.handleReset} className="flex-1">
                Opnieuw proberen
              </Button>
              <Button variant="primary" onClick={this.handleReload} className="flex-1">
                Pagina herladen
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Smaller error boundary for sections
export function SectionErrorBoundary({
  children,
  sectionName = 'Dit onderdeel',
}: {
  children: ReactNode
  sectionName?: string
}) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 bg-sunset/10 rounded-[20px] text-center">
          <p className="text-cocoa-light">
            {sectionName} kon niet worden geladen.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-sm text-sky hover:underline"
          >
            Pagina herladen
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

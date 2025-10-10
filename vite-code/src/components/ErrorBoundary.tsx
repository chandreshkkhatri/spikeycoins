import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = "/dashboard";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            textAlign: "center",
            backgroundColor: "#f9fafb",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              backgroundColor: "white",
              padding: "2rem",
              borderRadius: "12px",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: "bold",
                marginBottom: "1rem",
                color: "#dc2626",
              }}
            >
              ⚠️ Something went wrong
            </h1>
            <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
              The application encountered an error. Please try refreshing the
              page or going back to the dashboard.
            </p>

            {this.state.error && (
              <details
                style={{
                  backgroundColor: "#fef2f2",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1.5rem",
                  textAlign: "left",
                  border: "1px solid #fecaca",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: "600",
                    color: "#991b1b",
                    marginBottom: "0.5rem",
                  }}
                >
                  Error Details
                </summary>
                <pre
                  style={{
                    fontSize: "0.875rem",
                    color: "#7f1d1d",
                    overflow: "auto",
                    marginTop: "0.5rem",
                  }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo && (
                    <>
                      {"\n\n"}
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div
              style={{ display: "flex", gap: "1rem", justifyContent: "center" }}
            >
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Refresh Page
              </Button>
              <Button onClick={this.handleReset} variant="default">
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

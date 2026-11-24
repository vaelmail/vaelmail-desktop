import { Component, type ErrorInfo, type ReactNode } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { reportError } from "@/lib/bridge/report";

type Props = { label: string; onHome?: () => void; children: ReactNode };
type State = { error: Error | null };

export class ViewBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(
      `${this.props.label}: ${error.message}`,
      `${error.stack ?? ""}${info.componentStack ?? ""}`,
    );
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="vx-fault" role="alert">
        <WarningCircleIcon size={28} weight="duotone" aria-hidden />
        <h2>{this.props.label} couldn't open</h2>
        <p>The rest of VaelMail still works. The error was saved to the app log.</p>
        <code>{error.message || String(error)}</code>
        <div className="vx-fault-actions">
          <button
            type="button"
            className="vx-button"
            data-primary
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
          {this.props.onHome && (
            <button type="button" className="vx-button" onClick={this.props.onHome}>
              Go to Mail
            </button>
          )}
        </div>
      </div>
    );
  }
}

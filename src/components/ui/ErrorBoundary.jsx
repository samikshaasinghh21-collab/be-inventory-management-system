import { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Workspace view failed to render", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="ui-card ui-empty" role="alert"><span className="ui-empty-icon"><AlertCircle size={22} /></span><h1>This view could not be displayed</h1><p>Try loading it again. Your saved records are unchanged.</p><button type="button" className="app-btn app-btn-primary" onClick={() => window.location.reload()}><RefreshCw size={16} />Reload view</button><a className="executive-link" href="/">Back to overview</a></section>;
  }
}

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });
    console.error("Uncaught runtime React crash:", error, errorInfo);
  }

  private handleClearCache = () => {
    try {
      localStorage.clear();
      window.location.hash = '';
      window.location.search = '';
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans antialiased text-slate-800">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-xl">
            <div className="flex items-center gap-3.5 text-rose-600 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg md:text-xl text-slate-900 leading-tight">
                  Oops! App crashed (रिफ्रेश करें)
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 font-medium uppercase tracking-wider">
                  SYSTEM RUNTIME SAFETY ENGINE
                </p>
              </div>
            </div>

            <div className="space-y-3.5 text-sm leading-relaxed text-slate-600 border-t border-slate-100 pt-4">
              <p>
                <strong>English:</strong> A runtime error occurred in the application. This is usually caused by outdated or corrupt local storage cache. Clicking below will reset your local cache and reload the application.
              </p>
              <p className="text-slate-500 bg-slate-50 border border-slate-100 p-2.5 rounded-xl text-xs font-sans">
                <strong>हिंदी:</strong> ऐप में कुछ तकनीकी खराबी आई है। यह आमतौर पर पुराने ब्राउज़र डेटा (cache) के कारण होता है। नीचे दिए गए बटन पर क्लिक करके डेटा साफ़ करें और ऐप फिर से चालू हो जाएगा।
              </p>
            </div>

            {this.state.error && (
              <div className="mt-5 bg-rose-50/50 border border-rose-100 rounded-2xl p-4 font-mono text-[11px] text-rose-700 overflow-auto max-h-48 leading-relaxed">
                <p className="font-bold mb-1">Error Stack Trace:</p>
                <p className="whitespace-pre-wrap">{this.state.error.toString()}</p>
                {this.state.errorInfo && (
                  <p className="whitespace-pre-wrap mt-2 text-slate-500">
                    {this.state.errorInfo.componentStack}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3.5">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-slate-800 hover:bg-slate-950 text-white rounded-2xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <RefreshCw className="w-4 h-4 animate-spin-slow" />
                Reload Application (रीलोड करें)
              </button>

              <button
                onClick={this.handleClearCache}
                className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl py-3 px-4 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Clear Cache & Reset (डेटा साफ़ करें)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

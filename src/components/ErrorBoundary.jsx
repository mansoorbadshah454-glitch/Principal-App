import React from 'react';
import { ShieldAlert } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    height: '100vh',
                    width: '100vw',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8fafc',
                    padding: '2rem',
                    fontFamily: 'system-ui, sans-serif'
                }}>
                    <div style={{
                        background: 'white',
                        padding: '2rem',
                        borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                        maxWidth: '600px',
                        width: '100%',
                        textAlign: 'center'
                    }}>
                        <ShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto 1rem' }} />
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '0.5rem' }}>Something went wrong</h1>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>The application encountered an unexpected error.</p>

                        <div style={{
                            background: '#f1f5f9',
                            padding: '1rem',
                            borderRadius: '8px',
                            textAlign: 'left',
                            overflow: 'auto',
                            maxHeight: '200px',
                            fontSize: '0.85rem',
                            color: '#334155',
                            fontFamily: 'monospace',
                            marginBottom: '1.5rem'
                        }}>
                            <strong>Error:</strong> {this.state.error && this.state.error.toString()}
                            <br /><br />
                            <details>
                                <summary>Stack Trace</summary>
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </details>
                        </div>

                        <button
                            onClick={() => {
                                localStorage.clear();
                                window.location.href = '/';
                            }}
                            style={{
                                background: '#4f46e5',
                                color: 'white',
                                border: 'none',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '8px',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Clear Cache & Reload
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

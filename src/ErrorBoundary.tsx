import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.removeItem('prime-demo-attendance');
      localStorage.removeItem('prime-demo-leaves');
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0d2238 0%, #153856 100%)',
          color: '#ffffff',
          fontFamily: "'Prompt', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: '24px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            maxWidth: '520px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            borderRadius: '20px',
            padding: '32px 28px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
            <h2 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 10px 0', color: '#f5f9fc' }}>
              เกิดข้อผิดพลาดชั่วคราวในการแสดงผล
            </h2>
            <p style={{ fontSize: '14px', color: '#b2c8d8', lineHeight: 1.6, margin: '0 0 24px 0' }}>
              ระบบพบปัญหาที่ไม่คาดคิด กรุณากดปุ่มด้านล่างเพื่อรีเฟรชหน้าจอหรือกู้คืนสถานะการทำงาน
            </p>
            {this.state.error?.message && (
              <pre style={{
                background: 'rgba(0, 0, 0, 0.35)',
                color: '#ffb4a2',
                fontSize: '12px',
                padding: '12px 14px',
                borderRadius: '10px',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '24px',
                border: '1px solid rgba(255, 100, 100, 0.2)'
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={this.handleReload}
                style={{
                  background: 'linear-gradient(135deg, #1f6b4d 0%, #2f8e67 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 22px',
                  borderRadius: '12px',
                  fontWeight: 600,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(31, 107, 77, 0.4)'
                }}
              >
                🔄 โหลดหน้าเว็บใหม่
              </button>
              <button
                onClick={this.handleReset}
                style={{
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#d6e6f2',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                🧹 ล้างแคชและเริ่มใหม่
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

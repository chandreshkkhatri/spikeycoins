'use client';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function LoadingSpinner({
  message = 'Loading...',
  size = 'medium',
  className = '',
}: LoadingSpinnerProps) {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium',
    large: 'spinner-large',
  };

  return (
    <div className={`loading-container ${className}`}>
      <div className={`spinner ${sizeClasses[size]}`}>
        <div className="spinner-circle"></div>
        <div className="spinner-circle"></div>
        <div className="spinner-circle"></div>
        <div className="spinner-circle"></div>
      </div>
      {message && <p className="loading-message">{message}</p>}

      <style jsx>{`
        .loading-container {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 40px 20px;
          text-align: center;
        }

        .spinner {
          display: inline-block;
          position: relative;
        }

        .spinner-small {
          width: 32px;
          height: 32px;
        }

        .spinner-medium {
          width: 48px;
          height: 48px;
        }

        .spinner-large {
          width: 64px;
          height: 64px;
        }

        .spinner-circle {
          box-sizing: border-box;
          display: block;
          position: absolute;
          width: 80%;
          height: 80%;
          margin: 10%;
          border: 3px solid transparent;
          border-radius: 50%;
          animation: spinner-rotate 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
          border-color: #2196f3 transparent transparent transparent;
        }

        .spinner-circle:nth-child(1) {
          animation-delay: -0.45s;
        }

        .spinner-circle:nth-child(2) {
          animation-delay: -0.3s;
        }

        .spinner-circle:nth-child(3) {
          animation-delay: -0.15s;
        }

        .loading-message {
          margin-top: 16px;
          color: #666;
          font-size: 16px;
          font-weight: 400;
        }

        @keyframes spinner-rotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

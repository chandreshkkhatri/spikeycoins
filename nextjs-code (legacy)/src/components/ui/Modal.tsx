'use client';

import { ReactNode, useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  className = '',
}: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClasses = {
    small: 'modal-small',
    medium: 'modal-medium',
    large: 'modal-large',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${sizeClasses[size]} ${className}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {title && (
          <div className="modal-header">
            <h3 id="modal-title" className="modal-title">
              {title}
            </h3>
            <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
              ✕
            </button>
          </div>
        )}

        <div className="modal-body">{children}</div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.6);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          z-index: 1000;
          overflow-y: auto;
          padding-top: 30px;
          padding-bottom: 30px;
        }

        .modal-content {
          background: white;
          border-radius: 12px;
          max-height: none;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          animation: modalAppear 0.3s ease-out;
          margin: 0 20px;
          position: relative;
        }

        .modal-small {
          max-width: 400px;
          width: 100%;
        }

        .modal-medium {
          max-width: 600px;
          width: 100%;
        }

        .modal-large {
          max-width: 900px;
          width: 100%;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 24px 0;
          border-bottom: 1px solid #e9ecef;
          margin-bottom: 24px;
        }

        .modal-title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #333;
        }

        .modal-close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 8px;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .modal-close-btn:hover {
          background-color: #f1f3f4;
          color: #333;
        }

        .modal-body {
          padding: 24px;
          overflow: visible;
        }

        @keyframes modalAppear {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @media only screen and (max-width: 768px) {
          .modal-overlay {
            padding-top: 20px;
            padding-bottom: 20px;
          }

          .modal-content {
            margin: 0 10px;
          }

          .modal-header,
          .modal-body {
            padding: 16px;
          }

          .modal-header {
            margin-bottom: 16px;
          }
        }
      `}</style>
    </div>
  );
}

'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  title?: string;
  className?: string;
  hoverable?: boolean;
  action?: ReactNode;
  nightMode?: boolean;
}

export default function LegacyCard({
  children,
  title,
  className = '',
  hoverable = false,
  action,
  nightMode = false,
}: CardProps) {
  const cardClasses = `
    card 
    ${hoverable ? 'hoverable' : ''} 
    ${nightMode ? 'dark-card' : ''} 
    ${className}
  `.trim();

  return (
    <div className={cardClasses}>
      <div className="card-content">
        {title && <span className="card-title">{title}</span>}
        {children}
      </div>
      {action && <div className="card-action">{action}</div>}

      <style jsx>{`
        .card {
          margin: 0.5rem 0 1rem 0;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          transition: box-shadow 0.3s ease;
          background-color: #fff;
        }

        .card.hoverable:hover {
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
          transform: translateY(-2px);
          transition: all 0.3s ease;
        }

        .dark-card {
          background-color: #1e1e1e !important;
          color: #ffffff;
        }

        .dark-card .card-title {
          color: #ffffff;
        }

        .card-content {
          padding: 24px;
        }

        .card-title {
          font-size: 1.5rem;
          font-weight: 500;
          margin-bottom: 16px;
          display: block;
        }

        .card-action {
          padding: 16px 24px;
          border-top: 1px solid rgba(160, 160, 160, 0.2);
          background-color: rgba(0, 0, 0, 0.02);
        }

        .dark-card .card-action {
          border-top-color: rgba(255, 255, 255, 0.2);
          background-color: rgba(255, 255, 255, 0.05);
        }

        @media only screen and (max-width: 600px) {
          .card-content {
            padding: 16px;
          }

          .card-action {
            padding: 12px 16px;
          }
        }
      `}</style>
    </div>
  );
}

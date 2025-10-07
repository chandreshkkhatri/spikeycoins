import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

export type EnhancedCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  hoverable?: boolean;
  action?: ReactNode;
  imageUrl?: string;
  imageAlt?: string;
  clickable?: boolean;
  href?: string;
  customBackground?: string;
  customTextColor?: string;
};

export default function EnhancedCard({
  title,
  description,
  children,
  className = '',
  hoverable = true,
  action,
  imageUrl,
  imageAlt = 'Card media',
  clickable = false,
  href,
  customBackground,
  customTextColor,
}: EnhancedCardProps) {
  // Only make the whole card clickable if there's no conflicting action area.
  const isOverlayLink = clickable && href && !action;

  return (
    <div className={`enhanced-card ${hoverable ? 'hoverable' : ''} ${className}`}>
      {isOverlayLink && (
        <Link
          href={href!}
          aria-label={typeof title === 'string' ? title : 'Open card'}
          className="card-overlay-link"
        />
      )}

      {imageUrl && (
        <div className="card-image">
          <Image
            src={imageUrl}
            alt={imageAlt}
            width={1200}
            height={630}
            className="card-img"
            priority={false}
          />
          <div className="card-image-overlay" />
        </div>
      )}

      {(title || description) && (
        <div className="card-header">
          {title && <div className="card-title">{title}</div>}
          {description && <div className="card-description">{description}</div>}
        </div>
      )}

      {children && <div className="card-content">{children}</div>}

      {action && (
        <div className="card-footer">
          <div className="card-action-container">{action}</div>
        </div>
      )}

      <style jsx>{`
        .enhanced-card {
          background: ${customBackground || 'var(--background)'};
          border: 2px solid ${customBackground ? 'rgba(255,255,255,0.2)' : 'var(--border)'};
          border-radius: var(--radius-large);
          box-shadow:
            0 4px 20px rgba(0, 0, 0, 0.08),
            0 2px 8px rgba(0, 0, 0, 0.04);
          overflow: hidden;
          position: relative;
          transition: all 0.3s ease;
          ${customTextColor ? `color: ${customTextColor};` : ''}
        }

        .enhanced-card.hoverable:hover {
          transform: translateY(-2px);
          box-shadow:
            0 12px 40px rgba(0, 0, 0, 0.15),
            0 4px 16px rgba(0, 0, 0, 0.08);
          border-color: ${customBackground ? 'rgba(255,255,255,0.4)' : 'var(--primary)'};
        }

        .card-overlay-link {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10;
          text-decoration: none;
        }

        .card-image {
          position: relative;
          width: 100%;
          height: 200px;
          overflow: hidden;
        }

        .card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s ease;
        }

        .enhanced-card:hover .card-img {
          transform: scale(1.05);
        }

        .card-image-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent);
          pointer-events: none;
        }

        .card-header {
          padding: 24px 24px 0 24px;
        }

        .card-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: ${customTextColor || 'var(--foreground)'};
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .card-description {
          font-size: 0.95rem;
          color: ${customTextColor || 'var(--muted-foreground)'};
          line-height: 1.5;
          margin-bottom: 16px;
          opacity: ${customTextColor ? '0.9' : '1'};
          min-height: 2.85rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .card-content {
          padding: 16px 24px;
          color: ${customTextColor || 'var(--foreground)'};
          line-height: 1.6;
        }

        .card-footer {
          border-top: 1px solid var(--border);
          background: var(--muted);
          padding: 16px 24px;
          margin-top: auto;
          margin-bottom: 8px;
        }

        .card-action-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        /* Enhanced focus ring */
        .enhanced-card::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #3b82f6, #1d4ed8);
          transform: scaleX(0);
          transition: transform 0.3s ease;
          border-radius: 0 0 var(--radius-large) var(--radius-large);
        }

        .enhanced-card:hover::after {
          transform: scaleX(1);
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .card-header {
            padding: 16px 16px 0 16px;
          }

          .card-content {
            padding: 12px 16px;
          }

          .card-footer {
            padding: 12px 16px;
            margin-bottom: 6px;
          }

          .card-title {
            font-size: 1.3rem;
          }

          .card-description {
            font-size: 0.9rem;
          }

          .card-image {
            height: 160px;
          }
        }

        /* Animation improvements */
        .enhanced-card {
          animation: fadeInUp 0.5s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

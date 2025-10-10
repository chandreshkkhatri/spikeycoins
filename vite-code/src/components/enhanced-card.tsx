import "./enhanced-card.css";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

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
  className = "",
  hoverable = true,
  action,
  imageUrl,
  imageAlt = "Card media",
  clickable = false,
  href,
}: EnhancedCardProps) {
  // Only make the whole card clickable if there's no conflicting action area.
  const isOverlayLink = clickable && href && !action;

  return (
    <div
      className={`enhanced-card ${hoverable ? "hoverable" : ""} ${className}`}
    >
      {isOverlayLink && (
        <Link
          to={href!}
          aria-label={typeof title === "string" ? title : "Open card"}
          className="card-overlay-link"
        />
      )}

      {imageUrl && (
        <div className="card-image">
          <img
            src={imageUrl}
            alt={imageAlt}
            className="card-img"
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
    </div>
  );
}

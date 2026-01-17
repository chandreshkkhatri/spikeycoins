import "./LegacyCard.css";
import { ReactNode } from "react";

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
  className = "",
  hoverable = false,
  action,
  nightMode = false,
}: CardProps) {
  const cardClasses = `
    card
    ${hoverable ? "hoverable" : ""}
    ${nightMode ? "dark-card" : ""}
    ${className}
  `.trim();

  return (
    <div className={cardClasses}>
      <div className="card-content">
        {title && <span className="card-title">{title}</span>}
        {children}
      </div>
      {action && <div className="card-action">{action}</div>}
    </div>
  );
}

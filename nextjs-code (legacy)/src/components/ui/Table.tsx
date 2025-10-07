'use client';

import { ReactNode } from 'react';

interface Column {
  key: string;
  header: string;
  render?: (value: any, row: any, index: number) => ReactNode;
  className?: string;
}

interface TableProps {
  columns: Column[];
  data: any[];
  emptyMessage?: string;
  className?: string;
  dense?: boolean; // compact rows
}

export default function Table({
  columns,
  data,
  emptyMessage = 'No data available',
  className = '',
  dense = true,
}: TableProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage}</p>
        <style jsx>{`
          .empty-state {
            text-align: center;
            padding: 24px 16px;
            color: #666;
            background: #f8f9fa;
            border-radius: 6px;
            border: 1px dashed #ddd;
            font-size: 0.9rem;
          }
          :global(.dark) .empty-state {
            background: #2d3748;
            color: #a0aec0;
            border-color: #4a5568;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`table-container ${dense ? 'dense' : ''} ${className}`}>
      <div className="table-wrapper">
        <table className="responsive-table">
          <thead>
            <tr>
              {columns.map(column => (
                <th key={column.key} className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="table-row">
                {columns.map(column => (
                  <td key={column.key} className={column.className}>
                    {column.render ? column.render(row[column.key], row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .table-container {
          background: var(--card);
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
        }
        .table-wrapper {
          overflow-x: auto;
        }
        .responsive-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .responsive-table th {
          background: var(--surface-100);
          padding: 6px 8px;
          text-align: left;
          font-weight: 600;
          color: var(--text-primary);
          border-bottom: 1px solid var(--border);
          font-size: 0.65rem;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        :global(.dark) .responsive-table th {
          background: var(--surface-200);
          color: var(--foreground);
        }
        .responsive-table td {
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
          vertical-align: middle;
        }
        :global(.dark) .responsive-table td {
          border-bottom-color: var(--surface-200);
        }
        .table-row {
          transition: background 0.18s ease;
        }
        .table-row:hover {
          background: var(--surface-100);
        }
        :global(.dark) .table-row:hover {
          background: var(--surface-200);
        }
        .dense .responsive-table td {
          padding: 4px 6px;
        }
        .dense .responsive-table th {
          padding: 4px 6px;
        }
        .table-row:last-child td {
          border-bottom: none;
        }
        @media (max-width: 860px) {
          .responsive-table {
            font-size: 11px;
          }
        }
        @media (max-width: 640px) {
          .responsive-table {
            font-size: 10px;
          }
          .responsive-table th,
          .responsive-table td {
            padding: 4px 4px;
          }
        }
      `}</style>
    </div>
  );
}

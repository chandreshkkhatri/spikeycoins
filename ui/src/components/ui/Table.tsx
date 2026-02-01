import "./Table.css";
import { ReactNode } from "react";

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
  emptyMessage = "No data available",
  className = "",
  dense = true,
}: TableProps) {
  if (data.length === 0) {
    return (
      <div className="empty-state">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`table-container ${dense ? "dense" : ""} ${className}`}>
      <div className="table-wrapper">
        <table className="responsive-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={index} className="table-row">
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {column.render
                      ? column.render(row[column.key], row, index)
                      : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

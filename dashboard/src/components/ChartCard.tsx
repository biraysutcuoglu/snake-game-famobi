import type { ReactNode } from 'react';

export type TableData = { columns: string[]; rows: string[][] };

/**
 * Title + the question the chart answers + the chart + an always-available
 * table, so no reading depends on colour or hover.
 */
export const ChartCard = ({
  title,
  question,
  table,
  children
}: {
  title: string;
  question: string;
  table: TableData;
  children: ReactNode;
}) => (
  <section className="card" aria-label={title}>
    <h2>{title}</h2>
    <p className="muted">{question}</p>
    {children}
    <details>
      <summary>Show as table</summary>
      <table>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, index) => (
                <td key={index}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  </section>
);

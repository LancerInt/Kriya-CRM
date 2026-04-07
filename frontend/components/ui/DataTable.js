import LoadingSpinner from "./LoadingSpinner";
import EmptyState from "./EmptyState";

export default function DataTable({ columns, data, loading, emptyTitle, emptyDescription, onRowClick, onRowDoubleClick, rowClassName }) {
  if (loading) return <LoadingSpinner />;

  if (!data || data.length === 0) {
    return <EmptyState title={emptyTitle || "No data found"} description={emptyDescription} />;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row, i) => (
              <tr
                key={row.id || i}
                className={`${onRowClick || onRowDoubleClick ? "cursor-pointer hover:bg-gray-50" : ""} ${rowClassName ? rowClassName(row) : ""}`}
                onClick={() => onRowClick && onRowClick(row)}
                onDoubleClick={() => onRowDoubleClick && onRowDoubleClick(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key]}
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

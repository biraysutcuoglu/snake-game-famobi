export const StatTile = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="tile">
    <dt>{label}</dt>
    <dd>{value}</dd>
    {hint && <p>{hint}</p>}
  </div>
);

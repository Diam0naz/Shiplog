/** The three-bar mark used in the header, footer and favicon. */
export default function LogoMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--logo-bg)" />
      <rect x="7" y="9" width="18" height="3.5" rx="1.75" fill="#f5c518" />
      <rect x="7" y="15" width="13" height="3.5" rx="1.75" fill="#e6edf2" />
      <rect x="7" y="21" width="16" height="3.5" rx="1.75" fill="#e6edf2" fillOpacity="0.6" />
    </svg>
  );
}

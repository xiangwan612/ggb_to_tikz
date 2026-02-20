const BASE_URL = import.meta.env.BASE_URL || '/';
const LEGACY_PAGE_URL = `${BASE_URL}legacy-index.html`;

export default function LegacyFrame() {
  return (
    <section className="panel panel-right">
      <header className="panel-subheader">
        <h2>旧版工作区（兼容保留）</h2>
        <a className="link" href={LEGACY_PAGE_URL} target="_blank" rel="noreferrer">单独打开</a>
      </header>
      <iframe
        className="legacy-frame"
        src={LEGACY_PAGE_URL}
        title="Legacy GeoGebra Workspace"
      />
    </section>
  );
}

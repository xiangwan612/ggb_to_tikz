export default function LegacyFrame() {
  return (
    <section className="panel panel-right">
      <header className="panel-subheader">
        <h2>旧版工作区（兼容保留）</h2>
        <a className="link" href="/legacy-index.html" target="_blank" rel="noreferrer">单独打开</a>
      </header>
      <iframe
        className="legacy-frame"
        src="/legacy-index.html"
        title="Legacy GeoGebra Workspace"
      />
    </section>
  );
}

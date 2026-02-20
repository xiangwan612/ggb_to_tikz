export default function MigrationSidebar({ onOpenLegacy }) {
  return (
    <aside className="panel panel-left">
      <header className="panel-header">
        <h1>AI-GeoGebra</h1>
        <p>React 迁移工作区（阶段 1）</p>
      </header>

      <section className="card">
        <h2>当前策略</h2>
        <ul>
          <li>旧版功能继续可用（右侧 iframe）</li>
          <li>新功能优先写在 React</li>
          <li>稳定后逐模块替换旧版脚本</li>
        </ul>
      </section>

      <section className="card">
        <h2>迁移顺序</h2>
        <ol>
          <li>API 配置面板</li>
          <li>聊天输入与消息流</li>
          <li>命令编辑器</li>
          <li>GGB 执行层与导出</li>
        </ol>
      </section>

      <button className="btn" onClick={onOpenLegacy}>打开旧版（新标签页）</button>
    </aside>
  );
}

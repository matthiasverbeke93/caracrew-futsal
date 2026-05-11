const TABS = [
  { id: "attendance", label: "Game attendance" },
  { id: "stats", label: "Game stats" },
];

export default function Tabs({ activeTab, onTabChange }) {
  return (
    <nav className="tabs">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={activeTab === tab.id ? "active" : ""}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

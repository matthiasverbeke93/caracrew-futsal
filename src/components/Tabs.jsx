const TABS = [
  { id: "attendance", label: "Attendance", title: "Game attendance and roster" },
  { id: "stats", label: "Game stats", title: "Goals, assists, MotM and match totals" },
];

export default function Tabs({ activeTab, onTabChange }) {
  return (
    <nav className="tabs" role="tablist" aria-label="Sections for this match">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          title={tab.title}
          className={activeTab === tab.id ? "active" : ""}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

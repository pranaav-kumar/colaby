import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  IconMicrophone,
  IconMessageSquare,
  IconPenTool,
  IconCode2,
  IconUsers,
  IconArrowLeft
} from '../common/Icons';

export default function ActivityBar() {
  const { activeSection, setActiveSection, projectId } = useWorkspace();
  const navigate = useNavigate();

  const sections = [
    { id: 'voice', icon: IconMicrophone, label: 'Voice Call' },
    { id: 'chat', icon: IconMessageSquare, label: 'Team Chat' },
    { id: 'whiteboard', icon: IconPenTool, label: 'Whiteboard' },
    { id: 'ide', icon: IconCode2, label: 'Theia IDE' },
    { id: 'team', icon: IconUsers, label: 'Team' },
  ];

  return (
    <aside className="activity-bar" aria-label="Workspace Navigation">
      <div
        className="activity-bar-back"
        onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')}
        title="Back to Project"
      >
        <IconArrowLeft width={18} height={18} />
      </div>


      <nav className="activity-bar-icons">
        {sections.map(sec => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              className={`activity-bar-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveSection(sec.id)}
              title={sec.label}
              aria-label={sec.label}
            >
              <Icon width={20} height={20} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

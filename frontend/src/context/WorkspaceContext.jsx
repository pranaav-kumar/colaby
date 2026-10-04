import { createContext, useContext, useState, useEffect } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useVoiceCall } from '../hooks/useVoiceCall';
import { getProjectById, getProjectMembers } from '../api/projectApi';

const WorkspaceContext = createContext();

export function WorkspaceProvider({ projectId, children }) {
  const [projectInfo, setProjectInfo] = useState(null);
  const [members, setMembers] = useState([]);
  const [activeSection, setActiveSection] = useState('chat'); // 'voice', 'chat', 'whiteboard', 'ide', 'team'
  const wsConnection = useWebSocket(projectId);
  const voiceCall = useVoiceCall(projectId, wsConnection);
  const [loading, setLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState([]);

  useEffect(() => {
    if (!wsConnection?.subscribe) return;

    const handlePresence = (payload) => {
      if (payload?.onlineUsers && Array.isArray(payload.onlineUsers)) {
        setOnlineUserIds(Array.from(new Set(payload.onlineUsers.map(id => String(id).toLowerCase()))));
      } else if (payload?.userId) {
        setOnlineUserIds(prev => Array.from(new Set([...prev, String(payload.userId).toLowerCase()])));
      }
    };

    const handleUserLeft = (payload) => {
      if (payload?.onlineUsers && Array.isArray(payload.onlineUsers)) {
        setOnlineUserIds(Array.from(new Set(payload.onlineUsers.map(id => String(id).toLowerCase()))));
      } else if (payload?.userId) {
        const leftId = String(payload.userId).toLowerCase();
        setOnlineUserIds(prev => prev.filter(id => id !== leftId));
      }
    };

    const unsubAck = wsConnection.subscribe('CONNECTION_ACK', handlePresence);
    const unsubJoin = wsConnection.subscribe('USER_JOINED', handlePresence);
    const unsubLeft = wsConnection.subscribe('USER_LEFT', handleUserLeft);
    const unsubPresence = wsConnection.subscribe('PRESENCE_UPDATE', handlePresence);

    return () => {
      unsubAck?.();
      unsubJoin?.();
      unsubLeft?.();
      unsubPresence?.();
    };
  }, [wsConnection]);

  useEffect(() => {
    const fetchWorkspaceData = async () => {
      try {
        const [projRes, membersRes] = await Promise.all([
          getProjectById(projectId),
          getProjectMembers(projectId)
        ]);
        setProjectInfo(projRes.data);
        setMembers(Array.isArray(membersRes.data) ? membersRes.data : []);
      } catch (err) {
        console.error('Failed to fetch workspace context data', err);
      } finally {
        setLoading(false);
      }
    };
    if (projectId) {
      fetchWorkspaceData();
    }
  }, [projectId]);

  const value = {
    projectId,
    projectInfo,
    members,
    onlineUserIds,
    activeSection,
    setActiveSection,
    wsConnection,
    voiceCall,
    loading
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getWorkspace } from '../api/collaborationApi';
import { WorkspaceProvider, useWorkspace } from '../context/WorkspaceContext';
import ActivityBar from '../components/workspace/ActivityBar';
import TeamChat from '../components/workspace/TeamChat';
import Whiteboard from '../components/workspace/Whiteboard';
import TheiaIDE from '../components/workspace/TheiaIDE';
import TeamMembers from '../components/workspace/TeamMembers';
import VoiceCall from '../components/workspace/VoiceCall';
import RemoteAudioRenderer from '../components/workspace/RemoteAudioRenderer';
import {
  IconMicrophone,
  IconMicOff,
  IconHeadphones,
  IconPhoneOff
} from '../components/common/Icons';

function WorkspaceContent() {
  const { activeSection, setActiveSection, loading, projectInfo, voiceCall } = useWorkspace();

  if (loading) return <div className="ws-loading">Loading Workspace...</div>;

  return (
    <div className="workspace-layout">
      <RemoteAudioRenderer />

      <ActivityBar />
      <div className="workspace-content">
        {activeSection === 'chat' && <TeamChat />}
        {activeSection === 'whiteboard' && <Whiteboard />}
        {activeSection === 'ide' && <TheiaIDE />}
        {activeSection === 'team' && <TeamMembers />}
        {activeSection === 'voice' && <VoiceCall />}

        {/* Professional Mini Voice Dock (visible across other sections when connected) */}
        {voiceCall?.isInCall && activeSection !== 'voice' && (
          <div className="mini-voice-dock">
            <div className="mini-voice-info" onClick={() => setActiveSection('voice')} title="Click to open Voice Channel">
              <span className="mini-voice-indicator" />
              <div className="mini-voice-text">
                <span className="mini-voice-title">Voice Connected</span>
                <span className="mini-voice-channel">#{projectInfo?.name || 'project'}-voice • {voiceCall.ping}ms</span>
              </div>
            </div>

            <div className="mini-voice-controls">
              <button
                type="button"
                className={`mini-voice-btn ${voiceCall.isMuted ? 'muted' : ''}`}
                onClick={voiceCall.toggleMute}
                title={voiceCall.isMuted ? "Unmute" : "Mute"}
                aria-label={voiceCall.isMuted ? "Unmute" : "Mute"}
              >
                {voiceCall.isMuted ? <IconMicOff width={14} height={14} /> : <IconMicrophone width={14} height={14} />}
              </button>
              <button
                type="button"
                className={`mini-voice-btn ${voiceCall.isDeafened ? 'muted' : ''}`}
                onClick={voiceCall.toggleDeafen}
                title={voiceCall.isDeafened ? "Undeafen" : "Deafen"}
                aria-label={voiceCall.isDeafened ? "Undeafen" : "Deafen"}
              >
                <IconHeadphones width={14} height={14} />
              </button>
              <button
                type="button"
                className="mini-voice-btn disconnect"
                onClick={voiceCall.leaveCall}
                title="Disconnect from Voice"
                aria-label="Disconnect"
              >
                <IconPhoneOff width={14} height={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Workspace() {
  const { projectId } = useParams();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [initStatus, setInitStatus] = useState('initializing'); // initializing, success, error, denied

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setInitStatus('denied');
      return;
    }

    const initWs = async () => {
      try {
        await getWorkspace(projectId);
        setInitStatus('success');
      } catch (err) {
        if (err.response?.status === 403) {
          setInitStatus('denied');
        } else {
          setInitStatus('error');
        }
      }
    };
    initWs();
  }, [projectId, isAuthenticated, authLoading]);

  if (authLoading || initStatus === 'initializing') return <div className="ws-loading">Initializing Workspace...</div>;
  if (initStatus === 'denied') return (
    <div className="ws-access-denied" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h2>Access Denied</h2>
      <p style={{ color: 'var(--text-secondary)' }}>You are not a member of this project workspace.</p>
      <a href="/projects" className="btn-primary" style={{ textDecoration: 'none', padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-sm)' }}>
        &larr; Back to Projects
      </a>
    </div>
  );
  if (initStatus === 'error') return (
    <div className="ws-error" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h2>Workspace Error</h2>
      <p style={{ color: 'var(--text-secondary)' }}>Failed to initialize workspace. Please ensure backend services are running.</p>
      <a href="/projects" className="btn-primary" style={{ textDecoration: 'none', padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-sm)' }}>
        &larr; Back to Projects
      </a>
    </div>
  );

  return (
    <WorkspaceProvider projectId={projectId}>
      <WorkspaceContent />
    </WorkspaceProvider>
  );
}

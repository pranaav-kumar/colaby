import React from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/useAuth';
import {
  IconMicrophone,
  IconMicOff,
  IconHeadphones,
  IconPhoneOff,
  IconShield,
  IconUsers
} from '../common/Icons';

export default function VoiceCall() {
  const { projectInfo, voiceCall } = useWorkspace();
  const { user } = useAuth();

  const {
    isInCall,
    isConnecting,
    isMuted,
    isDeafened,
    isNoiseSuppression,
    participants,
    localSpeaking,
    localAudioLevel,
    ping,
    joinCall,
    leaveCall,
    toggleMute,
    toggleDeafen,
    toggleNoiseSuppression
  } = voiceCall;

  const currentUserName = user?.userId ? String(user.userId).substring(0, 8) : 'You';

  if (!isInCall) {
    return (
      <div className="voice-lobby workspace-section">
        <div className="voice-lobby-card">
          <div className="voice-lobby-icon-box">
            <IconMicrophone width={24} height={24} />
          </div>
          <h2 className="voice-lobby-title">#{projectInfo?.name || 'project'}-voice</h2>
          <p className="voice-lobby-desc">
            Ultra low-latency audio channel with hardware-accelerated noise suppression.
          </p>

          <div className="voice-specs-row">
            <span className="voice-spec-chip">WebRTC Mesh</span>
            <span className="voice-spec-chip">Opus 128kbps HD</span>
            <span className="voice-spec-chip">Noise Gate</span>
          </div>

          <div className="voice-lobby-meta">
            <span className="voice-status-chip">
              <span className="voice-status-dot" /> {participants.length} Active in channel
            </span>
          </div>

          <button
            type="button"
            className="btn-primary voice-connect-btn"
            onClick={joinCall}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting to RTC...' : 'Connect to Voice Channel'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="voice-room workspace-section">
      {/* Top Header */}
      <div className="voice-room-header">
        <div className="voice-channel-details">
          <IconMicrophone width={16} height={16} />
          <h3 className="voice-channel-name">#{projectInfo?.name || 'project'}-voice</h3>
          <span className="voice-rtc-tag">Connected</span>
          <span className="voice-ping-tag">{ping}ms</span>
        </div>

        <div className="voice-header-meta">
          <span className="voice-user-count">
            <IconUsers width={14} height={14} /> {participants.length + 1} Connected
          </span>
        </div>
      </div>

      {/* Users Grid */}
      <div className="voice-grid-container">
        <div className="voice-grid">
          {/* Local User Tile */}
          <div className={`voice-user-tile ${localSpeaking ? 'speaking' : ''} ${isMuted ? 'muted' : ''}`}>
            <div className="voice-user-avatar">
              {currentUserName.substring(0, 2).toUpperCase()}
            </div>
            <div className="voice-user-info">
              <span className="voice-user-name">{currentUserName} (You)</span>
              <div className="voice-state-icons">
                {isMuted && <span className="voice-indicator-tag mute" title="Muted"><IconMicOff width={12} height={12} /></span>}
                {isDeafened && <span className="voice-indicator-tag deafen" title="Deafened"><IconHeadphones width={12} height={12} /></span>}
              </div>
            </div>
            {/* Audio level meter */}
            <div className="voice-meter-track">
              <div
                className="voice-meter-fill"
                style={{ width: `${Math.max(4, isMuted ? 0 : localAudioLevel)}%` }}
              />
            </div>
          </div>

          {/* Remote Participants */}
          {participants.map(p => {
            const pName = p.id ? p.id.substring(0, 8) : 'User';
            return (
              <div key={p.id} className={`voice-user-tile ${p.isSpeaking ? 'speaking' : ''} ${p.isMuted ? 'muted' : ''}`}>
                <div className="voice-user-avatar remote">
                  {pName.substring(0, 2).toUpperCase()}
                </div>
                <div className="voice-user-info">
                  <span className="voice-user-name">{pName}</span>
                  <div className="voice-state-icons">
                    {p.isMuted && <span className="voice-indicator-tag mute" title="Muted"><IconMicOff width={12} height={12} /></span>}
                    {p.isDeafened && <span className="voice-indicator-tag deafen" title="Deafened"><IconHeadphones width={12} height={12} /></span>}
                  </div>
                </div>
                <div className="voice-meter-track">
                  <div
                    className="voice-meter-fill"
                    style={{ width: `${Math.max(4, p.isMuted ? 0 : p.audioLevel)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls Bar */}
      <div className="voice-controls-dock">
        <button
          type="button"
          className={`voice-ctrl-btn ${isMuted ? 'active-mute' : ''}`}
          onClick={toggleMute}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <IconMicOff width={16} height={16} /> : <IconMicrophone width={16} height={16} />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          type="button"
          className={`voice-ctrl-btn ${isDeafened ? 'active-deafen' : ''}`}
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
        >
          <IconHeadphones width={16} height={16} />
          <span>{isDeafened ? 'Deafened' : 'Deafen'}</span>
        </button>

        <button
          type="button"
          className={`voice-ctrl-btn ${isNoiseSuppression ? 'active-suppress' : ''}`}
          onClick={toggleNoiseSuppression}
          title={isNoiseSuppression ? "Disable Noise Suppression" : "Enable Noise Suppression"}
        >
          <IconShield width={16} height={16} />
          <span>{isNoiseSuppression ? 'Noise Gate: ON' : 'Noise Gate: OFF'}</span>
        </button>

        <button
          type="button"
          className="voice-ctrl-btn disconnect-btn"
          onClick={leaveCall}
          title="Disconnect from Voice Channel"
        >
          <IconPhoneOff width={16} height={16} />
          <span>Disconnect</span>
        </button>
      </div>
    </div>
  );
}

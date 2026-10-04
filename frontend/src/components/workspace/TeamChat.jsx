import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/useAuth';
import { getChatHistory } from '../../api/collaborationApi';

export default function TeamChat() {
  const { projectId, projectInfo, wsConnection } = useWorkspace();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const res = await getChatHistory(projectId, { limit: 100 });
        const list = Array.isArray(res.data) 
          ? res.data 
          : Array.isArray(res.data?.data) 
            ? res.data.data 
            : Array.isArray(res.data?.content) 
              ? res.data.content 
              : [];
        if (isMounted) {
          setMessages([...list].reverse());
        }
      } catch (err) {
        console.error('Failed to load chat history', err);
      }
    };
    if (projectId) {
      fetchHistory();
    }
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  useEffect(() => {
    if (!wsConnection?.subscribe) return;
    
    const unsubscribe = wsConnection.subscribe('CHAT_MESSAGE', (payload) => {
      const msg = payload?.payload || payload;
      if (!msg || !msg.content) return;
      
      setMessages(prev => {
        const msgId = msg.messageId || msg._id || msg.id;
        if (msgId) {
          const exists = prev.some(m => (m.messageId || m._id || m.id) === msgId);
          if (exists) return prev;
        } else {
          const isDup = prev.some(m => 
            (m.senderId === msg.senderId || m.userId === msg.userId) &&
            m.content === msg.content &&
            Math.abs(new Date(m.createdAt || 0) - new Date(msg.createdAt || 0)) < 2000
          );
          if (isDup) return prev;
        }
        return [...prev, msg];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [wsConnection?.subscribe]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !wsConnection?.isConnected) return;
    
    wsConnection.sendMessage('CHAT_MESSAGE', { content: trimmed });
    setInput('');
  };

  const currentUserId = user?.userId ? String(user.userId).toLowerCase() : '';

  return (
    <div className="chat-panel workspace-section">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-title">
          <span className="chat-section-label">Team Chat</span>
          <span className="chat-project-badge">#{projectInfo?.name || 'project'}</span>
        </div>
        <div className="chat-status-indicator">
          <span className={`chat-status-dot ${wsConnection?.isConnected ? 'connected' : 'connecting'}`} />
          <span className="chat-status-text">
            {wsConnection?.isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Message History */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <p>No messages yet in this project channel.</p>
            <span>Messages sent here are visible to all team members in real-time.</span>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const senderId = String(msg.senderId || msg.userId || '').toLowerCase();
            const isOwn = senderId && currentUserId && senderId === currentUserId;
            const senderDisplay = msg.senderName || msg.senderUsername || (senderId ? senderId.substring(0, 8) : 'User');
            const key = msg.messageId || msg._id || msg.id || `${msg.createdAt}-${idx}`;
            
            return (
              <div key={key} className={`chat-message-row ${isOwn ? 'own' : 'other'}`}>
                <div className="chat-avatar-mini">
                  {senderDisplay.substring(0, 2).toUpperCase()}
                </div>
                <div className="chat-message-body">
                  <div className="chat-meta">
                    <span className="chat-sender-name">{senderDisplay}</span>
                    {isOwn && <span className="chat-you-pill">You</span>}
                    <span className="chat-timestamp">
                      {new Date(msg.createdAt || msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="chat-text-content">{msg.content}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <form className="chat-input-area" onSubmit={handleSend}>
        <input 
          type="text" 
          className="chat-input-field" 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          placeholder={wsConnection?.isConnected ? "Send a message to team..." : "Connecting to workspace..."}
          disabled={!wsConnection?.isConnected}
          autoFocus
        />
        <button
          type="submit"
          className="btn-primary chat-send-btn"
          disabled={!wsConnection?.isConnected || !input.trim()}
        >
          Send
        </button>
      </form>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/useAuth';

export function useWebSocket(projectId) {
  const { accessToken } = useAuth();
  const [connectionState, setConnectionState] = useState('disconnected'); // connecting, connected, disconnected, error

  const ws = useRef(null);
  const reconnectTimeout = useRef(null);
  const heartbeatInterval = useRef(null);
  const subscribers = useRef(new Map()); // eventType -> Set of callbacks
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!projectId || !accessToken) return;

    // If already connected or connecting with an active socket, do not duplicate
    if (ws.current && (ws.current.readyState === WebSocket.CONNECTING || ws.current.readyState === WebSocket.OPEN)) {
      return;
    }

    setConnectionState('connecting');
    const wsUrl = `ws://localhost:8090/ws/workspace/${projectId}?token=${accessToken}`;
    const socket = new WebSocket(wsUrl);
    ws.current = socket;

    socket.onopen = () => {
      if (ws.current !== socket) return;
      setConnectionState('connected');
      reconnectAttempts.current = 0;

      // Start heartbeat
      clearInterval(heartbeatInterval.current);
      heartbeatInterval.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'HEARTBEAT' }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Notify subscribers
        if (message.type && subscribers.current.has(message.type)) {
          const cbs = Array.from(subscribers.current.get(message.type));
          cbs.forEach(cb => {
            try {
              cb(message.payload);
            } catch (cbErr) {
              console.error(`Error executing subscriber for ${message.type}:`, cbErr);
            }
          });
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    socket.onclose = () => {
      if (ws.current !== socket) return;
      setConnectionState('disconnected');
      clearInterval(heartbeatInterval.current);

      // Exponential backoff reconnect: 1s, 2s, 4s, 8s, 16s, up to 30s max
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;

      reconnectTimeout.current = setTimeout(connect, delay);
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      setConnectionState('error');
    };
  }, [projectId, accessToken]);

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        const s = ws.current;
        ws.current = null;
        if (s.readyState === WebSocket.OPEN) {
          s.close();
        } else if (s.readyState === WebSocket.CONNECTING) {
          s.onopen = () => { s.close(); };
        }
      }
      clearTimeout(reconnectTimeout.current);
      clearInterval(heartbeatInterval.current);
    };
  }, [connect]);

  const sendMessage = useCallback((type, payload) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('Cannot send message, WebSocket not open');
    }
  }, []);

  const subscribe = useCallback((eventType, callback) => {
    if (!subscribers.current.has(eventType)) {
      subscribers.current.set(eventType, new Set());
    }
    subscribers.current.get(eventType).add(callback);

    return () => {
      const callbacks = subscribers.current.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          subscribers.current.delete(eventType);
        }
      }
    };
  }, []);

  const isConnected = connectionState === 'connected';

  return useMemo(() => ({
    isConnected,
    connectionState,
    sendMessage,
    subscribe
  }), [isConnected, connectionState, sendMessage, subscribe]);
}

import { useRef, useEffect, useState, useCallback } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/useAuth';
import { getWhiteboardState } from '../../api/collaborationApi';
import {
  IconPencil,
  IconSquare,
  IconCircle,
  IconMinus,
  IconArrowUpRight,
  IconType,
  IconEraser
} from '../common/Icons';

// Cyan / muted developer palette for whiteboard collaboration
const COLLAB_COLORS = [
  '#22D3EE', '#38BDF8', '#818CF8', '#A78BFA', '#34D399',
  '#F472B6', '#FBBF24', '#60A5FA', '#4ADE80', '#2DD4BF'
];
function getUserColor(id = '') {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return COLLAB_COLORS[Math.abs(h) % COLLAB_COLORS.length];
}

export default function Whiteboard() {
  const { projectId, wsConnection } = useWorkspace();
  const { user } = useAuth();
  const currentUserName = user?.username || (user?.userId ? String(user.userId).substring(0, 8) : 'Me');

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('freehand');
  const [color, setColor] = useState('#6366F1');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState(null);
  const [remoteCursors, setRemoteCursors] = useState({});

  const objects = useRef([]);
  const isDrawing = useRef(false);
  const currentShape = useRef(null);
  const startPos = useRef({ x: 0, y: 0 });
  const lastCursorSend = useRef(0);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await getWhiteboardState(projectId);
        const state = res.data?.data || res.data;
        if (state && Array.isArray(state.objects)) {
          objects.current = state.objects.filter(o => !o.deleted);
          drawAll();
        }
      } catch (err) {
        console.error('Failed to load whiteboard state', err);
      }
    };
    fetchState();
  }, [projectId]);

  const drawShape = useCallback((ctx, obj) => {
    if (!obj || obj.deleted) return;
    ctx.save();
    ctx.strokeStyle = obj.style?.stroke || obj.style?.color || '#6366F1';
    ctx.fillStyle = obj.style?.fill || 'transparent';
    ctx.lineWidth = obj.style?.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (obj.type === 'freehand' || obj.type === 'path') {
      if (obj.points && obj.points.length > 0) {
        ctx.beginPath();
        obj.points.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      }
    } else if (obj.type === 'rectangle') {
      ctx.beginPath();
      ctx.rect(obj.x, obj.y, obj.width, obj.height);
      if (obj.style?.fill && obj.style.fill !== 'transparent') ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'ellipse') {
      ctx.beginPath();
      const rx = Math.abs((obj.width || 0) / 2);
      const ry = Math.abs((obj.height || 0) / 2);
      const cx = (obj.x || 0) + (obj.width || 0) / 2;
      const cy = (obj.y || 0) + (obj.height || 0) / 2;
      ctx.ellipse(cx, cy, rx > 0 ? rx : 1, ry > 0 ? ry : 1, 0, 0, 2 * Math.PI);
      if (obj.style?.fill && obj.style.fill !== 'transparent') ctx.fill();
      ctx.stroke();
    } else if (obj.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(obj.x, obj.y);
      ctx.lineTo(obj.x + (obj.width || 0), obj.y + (obj.height || 0));
      ctx.stroke();
    } else if (obj.type === 'arrow') {
      const fromX = obj.x, fromY = obj.y;
      const toX = obj.x + (obj.width || 0), toY = obj.y + (obj.height || 0);
      const headlen = 12;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
      ctx.stroke();
    } else if (obj.type === 'text') {
      ctx.font = `${obj.style?.fontSize || 14}px Inter, -apple-system, sans-serif`;
      ctx.fillStyle = obj.style?.stroke || '#E5E7EB';
      ctx.fillText(obj.style?.textContent || obj.text || '', obj.x, obj.y);
    }
    ctx.restore();
  }, []);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objects.current.forEach(obj => { if (!obj.deleted) drawShape(ctx, obj); });
    if (currentShape.current) drawShape(ctx, currentShape.current);
  }, [drawShape]);

  useEffect(() => {
    if (!wsConnection?.subscribe) return;
    const unsubs = [
      wsConnection.subscribe('WHITEBOARD_OBJECT_CREATE', (payload) => {
        const obj = payload.payload || payload;
        if (!objects.current.some(o => o.objectId === obj.objectId)) {
          objects.current.push(obj);
          requestAnimationFrame(drawAll);
        }
      }),
      wsConnection.subscribe('WHITEBOARD_OBJECT_UPDATE', (payload) => {
        const update = payload.payload || payload;
        const idx = objects.current.findIndex(o => o.objectId === update.objectId);
        if (idx !== -1) { objects.current[idx] = { ...objects.current[idx], ...update }; requestAnimationFrame(drawAll); }
      }),
      wsConnection.subscribe('WHITEBOARD_OBJECT_DELETE', (payload) => {
        const { objectId } = payload.payload || payload;
        objects.current = objects.current.filter(o => o.objectId !== objectId);
        requestAnimationFrame(drawAll);
      }),
      wsConnection.subscribe('WHITEBOARD_CLEAR', () => {
        objects.current = []; currentShape.current = null; isDrawing.current = false;
        setTextPosition(null); setTextInput('');
        requestAnimationFrame(drawAll);
      }),
      wsConnection.subscribe('WHITEBOARD_CURSOR_MOVE', (payload) => {
        const data = payload.payload || payload;
        if (data.userId && data.userId !== user?.userId) {
          setRemoteCursors(prev => ({
            ...prev,
            [data.userId]: { ...data, color: getUserColor(data.userId), lastSeen: Date.now() }
          }));
        }
      })
    ];
    return () => unsubs.forEach(u => u());
  }, [wsConnection?.subscribe, user?.userId, drawAll]);

  // Clean stale cursors after 5s
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(k => { if (now - next[k].lastSeen > 5000) { delete next[k]; changed = true; } });
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const resize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        drawAll();
      }
    };
    window.addEventListener('resize', resize);
    resize();
    return () => window.removeEventListener('resize', resize);
  }, [drawAll]);

  const handlePointerDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    if (tool === 'eraser') {
      const radius = 15;
      const idx = objects.current.findIndex(obj => {
        if (obj.points) return obj.points.some(p => Math.hypot(p.x - x, p.y - y) < radius);
        return x >= obj.x - radius && x <= obj.x + (obj.width || 0) + radius &&
               y >= obj.y - radius && y <= obj.y + (obj.height || 0) + radius;
      });
      if (idx !== -1) {
        const del = objects.current[idx];
        objects.current.splice(idx, 1);
        drawAll();
        if (wsConnection?.isConnected) wsConnection.sendMessage('WHITEBOARD_OBJECT_DELETE', { objectId: del.objectId });
      }
      return;
    }
    if (tool === 'text') { setTextPosition({ x, y }); return; }

    isDrawing.current = true;
    startPos.current = { x, y };
    currentShape.current = tool === 'freehand'
      ? { objectId: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), type: 'freehand', x, y, points: [{ x, y }], style: { stroke: color, strokeWidth } }
      : { objectId: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), type: tool, x, y, width: 0, height: 0, style: { stroke: color, strokeWidth, fill: 'transparent' } };
  };

  const handlePointerMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    const now = Date.now();
    if (now - lastCursorSend.current > 40 && wsConnection?.isConnected && user?.userId) {
      wsConnection.sendMessage('WHITEBOARD_CURSOR_MOVE', { userId: user.userId, userName: currentUserName, x, y });
      lastCursorSend.current = now;
    }

    if (!isDrawing.current || !currentShape.current) return;
    if (tool === 'freehand') currentShape.current.points.push({ x, y });
    else { currentShape.current.width = x - startPos.current.x; currentShape.current.height = y - startPos.current.y; }
    requestAnimationFrame(drawAll);
  };

  const handlePointerUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (currentShape.current) {
      const fin = { ...currentShape.current };
      objects.current.push(fin);
      if (wsConnection?.isConnected) wsConnection.sendMessage('WHITEBOARD_OBJECT_CREATE', fin);
      currentShape.current = null;
    }
    drawAll();
  };

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!textInput.trim() || !textPosition) return;
    const obj = { objectId: 'obj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4), type: 'text', x: textPosition.x, y: textPosition.y, style: { stroke: color, fontSize: 14, textContent: textInput } };
    objects.current.push(obj);
    if (wsConnection?.isConnected) wsConnection.sendMessage('WHITEBOARD_OBJECT_CREATE', obj);
    setTextInput(''); setTextPosition(null); drawAll();
  };

  const clearCanvas = () => {
    objects.current = []; currentShape.current = null; isDrawing.current = false;
    setTextPosition(null); setTextInput(''); drawAll();
    if (wsConnection?.isConnected) wsConnection.sendMessage('WHITEBOARD_CLEAR', {});
  };

  const tools = [
    { id: 'freehand', icon: IconPencil, label: 'Draw' },
    { id: 'rectangle', icon: IconSquare, label: 'Rectangle' },
    { id: 'ellipse', icon: IconCircle, label: 'Circle' },
    { id: 'line', icon: IconMinus, label: 'Line' },
    { id: 'arrow', icon: IconArrowUpRight, label: 'Arrow' },
    { id: 'text', icon: IconType, label: 'Text' },
    { id: 'eraser', icon: IconEraser, label: 'Eraser' }
  ];

  return (
    <div className="whiteboard-container workspace-section">
      {/* Top Toolbar */}
      <div className="whiteboard-toolbar">
        <div className="wb-tool-group">
          {tools.map(t => {
            const Icon = t.icon;
            const isActive = tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                className={`wb-tool-btn ${isActive ? 'active' : ''}`}
                onClick={() => { setTool(t.id); setTextPosition(null); }}
                title={t.label}
                aria-label={t.label}
              >
                <Icon width={16} height={16} />
              </button>
            );
          })}
        </div>

        <div className="wb-style-group">
          <label className="wb-control-label">Stroke</label>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="wb-color-picker"
            title="Stroke Color"
          />

          <label className="wb-control-label">Width</label>
          <select
            value={strokeWidth}
            onChange={e => setStrokeWidth(Number(e.target.value))}
            className="wb-select"
          >
            <option value={1}>1px</option>
            <option value={2}>2px</option>
            <option value={4}>4px</option>
            <option value={6}>6px</option>
          </select>

          <button
            type="button"
            className="btn-secondary wb-clear-btn"
            onClick={clearCanvas}
            title="Clear canvas"
          >
            Clear Canvas
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="whiteboard-canvas-area" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            touchAction: 'none',
            cursor: tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair'
          }}
        />

        {/* Text input overlay */}
        {textPosition && (
          <form onSubmit={handleTextSubmit} style={{ position: 'absolute', left: textPosition.x, top: textPosition.y - 10, zIndex: 10 }}>
            <input
              type="text"
              autoFocus
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Type & press Enter..."
              className="wb-text-overlay-input"
              style={{ color }}
              onBlur={() => { if (!textInput) setTextPosition(null); }}
            />
          </form>
        )}

        {/* Real-time remote cursors */}
        {Object.values(remoteCursors).map(cursor => (
          <div
            key={cursor.userId}
            className="wb-live-cursor"
            style={{ left: cursor.x, top: cursor.y }}
          >
            <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M0 0 L0 14 L3.5 10.5 L6 16 L8 15 L5.5 9.5 L10.5 9.5 Z"
                fill={cursor.color || '#22D3EE'}
                stroke="#0B1020"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="wb-cursor-label"
              style={{ borderLeftColor: cursor.color || '#22D3EE' }}
            >
              {cursor.userName || cursor.userId?.substring(0, 6) || 'User'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

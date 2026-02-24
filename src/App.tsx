import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text } from 'react-konva';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import {
  Pencil,
  Eraser,
  Square,
  Circle as CircleIcon,
  MousePointer2,
  Trash2,
  Share2,
  Users,
  Monitor,
  LogOut,
  ArrowDown,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { Tool, DrawingElement, Point } from './types';
import { cn } from './utils';

const COLORS = [
  '#000000', '#ef4444', '#f97316', '#f59e0b', '#10b981', 
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ffffff'
];

const STROKE_WIDTHS = [2, 4, 8, 12];

interface User {
  id: string;
  name: string;
  color: string;
  ipAddress: string;
  joinedAt: Date;
}

interface Cursor {
  userId: string;
  x: number;
  y: number;
}

export default function App() {
  const [boardId, setBoardId] = useState<string>('default-room');
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState<string>('#000000');
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [showNamePrompt, setShowNamePrompt] = useState(true);
  const [remoteCursors, setRemoteCursors] = useState<Map<string, Cursor>>(new Map());
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showStrokePicker, setShowStrokePicker] = useState(false);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', type: 'alert' });
  const [toolbarPosition, setToolbarPosition] = useState<'left' | 'right' | 'bottom'>('left');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeSessions, setActiveSessions] = useState<Array<{
    id: string;
    userCount: number;
    userNames: string[];
    createdAt: string;
    lastActivity: string;
  }>>([]);

  const stageRef = useRef<any>(null);
  const currentElementId = useRef<string | null>(null);
  const lastCursorEmit = useRef<number>(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setBoardId(hash);
    } else {
      const newId = nanoid(6);
      window.location.hash = newId;
      setBoardId(newId);
    }

    const handleHashChange = () => {
      setBoardId(window.location.hash.slice(1));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Fetch active sessions when on login page
  useEffect(() => {
    if (showNamePrompt) {
      fetch('/api/active-sessions')
        .then(res => res.json())
        .then(sessions => setActiveSessions(sessions))
        .catch(err => console.error('Failed to fetch active sessions:', err));
    }
  }, [showNamePrompt]);

  // Initialize Socket
  useEffect(() => {
    if (!boardId || !userName) return;
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setConnected(true);
      newSocket.emit('join-board', { boardId, userName });
    });

    newSocket.on('init-state', (initialElements: DrawingElement[]) => {
      setElements(initialElements);
    });

    newSocket.on('remote-draw', (element: DrawingElement) => {
      setElements(prev => {
        const index = prev.findIndex(e => e.id === element.id);
        if (index !== -1) {
          const newElements = [...prev];
          newElements[index] = element;
          return newElements;
        }
        return [...prev, element];
      });
    });

    newSocket.on('board-cleared', () => {
      setElements([]);
    });

    newSocket.on('users-update', (updatedUsers: User[]) => {
      setUsers(updatedUsers);
    });

    newSocket.on('remote-cursor', ({ userId, x, y }: { userId: string; x: number; y: number }) => {
      console.log('Received remote cursor:', userId, x, y);
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.set(userId, { userId, x, y });
        console.log('Remote cursors count:', next.size);
        return next;
      });
    });

    newSocket.on('cursor-hide', (userId: string) => {
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, [boardId, userName]);

  // Prevent page scrolling on touch devices
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if ((e.target as HTMLElement).closest('main')) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('aside')) {
        setShowColorPicker(false);
        setShowStrokePicker(false);
      }
    };

    if (showColorPicker || showStrokePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker, showStrokePicker]);

  const handleMouseDown = (e: any) => {
    if (tool === 'select') return;

    setIsDrawing(true);
    const pos = e.target.getStage().getPointerPosition();
    const id = nanoid();
    currentElementId.current = id;

    let newElement: DrawingElement;

    if (tool === 'pencil' || tool === 'eraser') {
      newElement = {
        id,
        type: tool,
        color: tool === 'eraser' ? '#ffffff' : color,
        strokeWidth,
        points: [pos.x, pos.y],
      };
    } else if (tool === 'rect') {
      newElement = {
        id,
        type: 'rect',
        color,
        strokeWidth,
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
      };
    } else if (tool === 'circle') {
      newElement = {
        id,
        type: 'circle',
        color,
        strokeWidth,
        x: pos.x,
        y: pos.y,
        radius: 0,
      };
    } else {
      return;
    }

    setElements(prev => [...prev, newElement]);
    socket?.emit('draw-event', { boardId, element: newElement });
  };

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();

    if (!pos) return;

    // Emit cursor position to other users (throttled to 60fps)
    const now = Date.now();
    if (socket && boardId && now - lastCursorEmit.current > 16) {
      socket.emit('cursor-move', { boardId, x: pos.x, y: pos.y });
      lastCursorEmit.current = now;
      // console.log('Emitting cursor:', pos.x, pos.y); // Uncomment for debugging
    }

    if (!isDrawing || !currentElementId.current) return;
    const id = currentElementId.current;

    setElements(prev => {
      const index = prev.findIndex(el => el.id === id);
      if (index === -1) return prev;

      const element = prev[index];
      let updatedElement = { ...element };

      if (element.type === 'pencil' || element.type === 'eraser') {
        updatedElement.points = [...(element.points || []), pos.x, pos.y];
      } else if (element.type === 'rect') {
        updatedElement.width = pos.x - (element.x || 0);
        updatedElement.height = pos.y - (element.y || 0);
      } else if (element.type === 'circle') {
        const dx = pos.x - (element.x || 0);
        const dy = pos.y - (element.y || 0);
        updatedElement.radius = Math.sqrt(dx * dx + dy * dy);
      }

      socket?.emit('draw-event', { boardId, element: updatedElement });
      
      const newElements = [...prev];
      newElements[index] = updatedElement;
      return newElements;
    });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    currentElementId.current = null;
  };

  const clearBoard = () => {
    setModal({
      isOpen: true,
      title: 'Clear Board',
      message: 'Are you sure you want to clear the entire board? This cannot be undone.',
      type: 'confirm',
      onConfirm: () => {
        socket?.emit('clear-board', boardId);
        setElements([]);
        setModal({ isOpen: false, title: '', message: '', type: 'alert' });
      }
    });
  };

  const handleMouseLeave = () => {
    if (socket && boardId) {
      socket.emit('cursor-leave', boardId);
    }
  };

  const copyRoomLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setModal({
        isOpen: true,
        title: '✅ Link Copied!',
        message: `Share this URL to cast to other screens:\n\n${url}`,
        type: 'alert',
        onConfirm: () => {
          window.open(url, '_blank');
          setModal({ isOpen: false, title: '', message: '', type: 'alert' });
        }
      });
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setModal({
          isOpen: true,
          title: '✅ Link Copied!',
          message: `Share this URL to cast to other screens:\n\n${url}`,
          type: 'alert',
          onConfirm: () => {
            window.open(url, '_blank');
            setModal({ isOpen: false, title: '', message: '', type: 'alert' });
          }
        });
      } catch (fallbackErr) {
        setModal({
          isOpen: true,
          title: '❌ Copy Failed',
          message: `Could not copy automatically. Please copy this URL manually:\n\n${url}`,
          type: 'alert'
        });
      }
      document.body.removeChild(textArea);
    }
  };

  const handleLeaveSession = () => {
    setModal({
      isOpen: true,
      title: 'Leave Session',
      message: 'Are you sure you want to leave this session? Your drawings will be lost.',
      type: 'confirm',
      onConfirm: () => {
        socket?.disconnect();
        setShowNamePrompt(true);
        setUserName('');
        setElements([]);
        setUsers([]);
        setRemoteCursors(new Map());
        setModal({ isOpen: false, title: '', message: '', type: 'alert' });
      }
    });
  };

  const handleJoinBoard = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userName.trim()) {
      setShowNamePrompt(false);
    }
  };

  const handleJoinSession = (sessionId: string) => {
    if (userName.trim()) {
      // Clear existing elements before joining new session
      setElements([]);
      setRemoteCursors(new Map());
      window.location.hash = sessionId;
      setBoardId(sessionId);
      setShowNamePrompt(false);
    } else {
      setModal({
        isOpen: true,
        title: '⚠️ Name Required',
        message: 'Please enter your name before joining a session.',
        type: 'alert'
      });
    }
  };

  const handleCreateNew = () => {
    if (userName.trim()) {
      // Clear existing elements before creating new session
      setElements([]);
      setRemoteCursors(new Map());
      const newId = nanoid(6);
      window.location.hash = newId;
      setBoardId(newId);
      setShowNamePrompt(false);
    } else {
      setModal({
        isOpen: true,
        title: '⚠️ Name Required',
        message: 'Please enter your name before creating a session.',
        type: 'alert'
      });
    }
  };

  if (showNamePrompt) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#005a9c] to-[#003d6b] p-6">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-gray-200">
            <div className="w-12 h-12 bg-[#005a9c] rounded-xl flex items-center justify-center">
              <Monitor className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="font-bold text-[#005a9c] text-xl">Tata ClassEdge</h1>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Collaborative Whiteboard</p>
            </div>
          </div>

          {/* Name Input */}
          <div className="p-6 border-b border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#005a9c] focus:border-transparent outline-none"
              autoFocus
            />
          </div>

          {/* Active Sessions */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Active Sessions</h2>
              <span className="text-sm text-gray-500">{activeSessions.length} active</span>
            </div>

            {activeSessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No active sessions</p>
                <p className="text-xs mt-1">Create a new session to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeSessions.map(session => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-xl hover:border-[#005a9c] hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-sm font-mono font-semibold text-gray-800">#{session.id}</code>
                      </div>
                      <div className="flex items-center gap-1 mb-1">
                        <Users size={14} className="text-gray-500" />
                        <p className="text-xs text-gray-700">
                          {session.userNames && session.userNames.length > 0
                            ? session.userNames.join(', ')
                            : `${session.userCount} ${session.userCount === 1 ? 'user' : 'users'}`
                          }
                        </p>
                      </div>
                      <p className="text-xs text-gray-500">
                        Last activity: {new Date(session.lastActivity).toLocaleTimeString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleJoinSession(session.id)}
                      className="px-4 py-2 bg-[#005a9c] text-white text-sm font-medium rounded-lg hover:bg-[#004a80] transition-colors"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create New Button */}
          <div className="p-6 border-t border-gray-200">
            <button
              onClick={handleCreateNew}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <span>+</span> Create New Session
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F0] overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 bg-white border-b border-black/5 flex items-center justify-between px-6 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#005a9c] rounded-xl flex items-center justify-center">
            <Monitor className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-[#005a9c] leading-tight">Tata ClassEdge</h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">Whiteboard • Room: {boardId}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-xl text-sm">
            <Users size={16} className="text-gray-600" />
            <span className="font-medium text-gray-700">{users.length} online</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium">
            <div className={cn("w-2 h-2 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            {connected ? 'Live' : 'Disconnected'}
          </div>

          <button
            onClick={copyRoomLink}
            className="flex items-center gap-2 px-4 py-2 bg-[#005a9c] text-white rounded-xl text-sm font-medium hover:bg-[#004a80] transition-colors shadow-sm"
          >
            <Share2 size={16} />
            Cast to Screen
          </button>

          <button
            onClick={handleLeaveSession}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors shadow-sm"
          >
            <LogOut size={16} />
            Leave
          </button>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Active Users Panel */}
        {users.length > 0 && (
          <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-lg border border-black/5 p-2 w-44">
            <div className="flex items-center gap-1 mb-1.5 pb-1.5 border-b border-gray-100">
              <Users size={12} className="text-[#005a9c]" />
              <h3 className="font-semibold text-gray-800 text-xs">Users ({users.length})</h3>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {users.map((user) => (
                <div key={user.id} className="flex items-start gap-1.5 p-1 rounded hover:bg-gray-50 transition-colors">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate text-xs">{user.name}</p>
                    {user.id === socket?.id && (
                      <p className="text-[10px] text-gray-500">(You)</p>
                    )}
                    {user.ipAddress && (
                      <p className="text-[9px] text-gray-500 font-mono truncate">{user.ipAddress}</p>
                    )}
                  </div>
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse flex-shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Branding Footer */}
        <div className="absolute bottom-4 right-6 z-20 pointer-events-none opacity-40">
          <p className="text-[10px] font-semibold text-[#005a9c] uppercase tracking-[0.2em]">Tata ClassEdge Limited</p>
        </div>

        {/* Toolbar */}
        <aside
          className="absolute z-20"
          style={{
            transition: 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            left: toolbarPosition === 'left' ? '24px' : toolbarPosition === 'right' ? 'calc(100vw - 24px)' : '50vw',
            top: toolbarPosition === 'bottom' ? 'calc(100vh - 168px)' : '50vh',
            transform:
              toolbarPosition === 'left' ? 'translate(0, -50%)' :
              toolbarPosition === 'right' ? 'translate(-100%, -50%)' :
              'translate(-50%, 0)',
          }}
        >
          <div
            className={cn(
              "bg-white p-2 rounded-2xl shadow-xl border border-black/5 flex gap-1",
              toolbarPosition === 'bottom' ? "flex-row" : "flex-col",
              isTransitioning && "scale-95 opacity-90"
            )}
            style={{
              transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Drawing Tools */}
            <ToolButton
              active={tool === 'select'}
              onClick={() => setTool('select')}
              icon={<MousePointer2 size={20} />}
              label="Select"
            />
            <ToolButton
              active={tool === 'pencil'}
              onClick={() => setTool('pencil')}
              icon={<Pencil size={20} />}
              label="Pencil"
            />
            <ToolButton
              active={tool === 'rect'}
              onClick={() => setTool('rect')}
              icon={<Square size={20} />}
              label="Rectangle"
            />
            <ToolButton
              active={tool === 'circle'}
              onClick={() => setTool('circle')}
              icon={<CircleIcon size={20} />}
              label="Circle"
            />
            <ToolButton
              active={tool === 'eraser'}
              onClick={() => setTool('eraser')}
              icon={<Eraser size={20} />}
              label="Eraser"
            />

            <div
              className={cn(
                "bg-black/5",
                toolbarPosition === 'bottom' ? "w-px mx-1" : "h-px my-1"
              )}
              style={{
                transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />

            {/* Color Picker Button */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowColorPicker(!showColorPicker);
                  setShowStrokePicker(false);
                }}
                className={cn(
                  "w-full p-2.5 rounded-lg transition-all",
                  showColorPicker ? "bg-[#005a9c]/10" : "hover:bg-gray-50"
                )}
                title="Choose Color"
              >
                <div className="flex items-center justify-center">
                  <div
                    className="w-8 h-8 rounded-lg border-2 border-gray-300"
                    style={{ backgroundColor: color }}
                  />
                </div>
              </button>

              {/* Color Picker Dropdown */}
              {showColorPicker && (
                <div className={cn(
                  "absolute bg-white p-3 rounded-lg shadow-lg border border-gray-200",
                  toolbarPosition === 'left' && "left-full ml-3 top-0",
                  toolbarPosition === 'right' && "right-full mr-3 top-0",
                  toolbarPosition === 'bottom' && "bottom-full mb-3 left-0"
                )} style={{ width: '180px' }}>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                      <div
                        key={c}
                        onClick={() => {
                          setColor(c);
                          setShowColorPicker(false);
                        }}
                        className="cursor-pointer rounded"
                        style={{
                          width: '28px',
                          height: '28px',
                          backgroundColor: c,
                          border: color === c ? '2px solid #005a9c' : '2px solid #e5e7eb',
                          flexShrink: 0
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Stroke Width Button */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowStrokePicker(!showStrokePicker);
                  setShowColorPicker(false);
                }}
                className={cn(
                  "w-full p-2.5 rounded-lg transition-all",
                  showStrokePicker ? "bg-[#005a9c]/10" : "hover:bg-gray-50"
                )}
                title="Stroke Width"
              >
                <div className="flex items-center justify-center" style={{ height: '32px' }}>
                  <div
                    className="rounded bg-gray-800"
                    style={{ width: '24px', height: strokeWidth + 'px' }}
                  />
                </div>
              </button>

              {/* Stroke Width Dropdown */}
              {showStrokePicker && (
                <div className={cn(
                  "absolute bg-white p-3 rounded-xl shadow-lg border border-gray-300 z-50",
                  toolbarPosition === 'left' && "left-full ml-3 top-0",
                  toolbarPosition === 'right' && "right-full mr-3 top-0",
                  toolbarPosition === 'bottom' && "bottom-full mb-3 left-0"
                )}>
                  <div className="flex flex-col gap-3">
                    {STROKE_WIDTHS.map(w => (
                      <button
                        key={w}
                        onClick={() => {
                          setStrokeWidth(w);
                          setShowStrokePicker(false);
                        }}
                        className={cn(
                          "flex items-center justify-center py-2 px-4 rounded-lg transition-all",
                          strokeWidth === w ? "bg-[#005a9c]/10" : "hover:bg-gray-50"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded transition-colors",
                            strokeWidth === w ? "bg-[#005a9c]" : "bg-gray-700"
                          )}
                          style={{ width: '40px', height: w + 'px' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className={cn(
                "bg-black/5",
                toolbarPosition === 'bottom' ? "w-px mx-1" : "h-px my-1"
              )}
              style={{
                transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />

            <ToolButton
              active={false}
              onClick={() => {
                const currentPos = toolbarPosition;
                const nextPos = currentPos === 'left' ? 'bottom' : currentPos === 'bottom' ? 'right' : 'left';

                // Check if orientation is changing (vertical to horizontal or vice versa)
                const isOrientationChange =
                  (currentPos !== 'bottom' && nextPos === 'bottom') ||
                  (currentPos === 'bottom' && nextPos !== 'bottom');

                if (isOrientationChange) {
                  setIsTransitioning(true);
                  setTimeout(() => setIsTransitioning(false), 500);
                }

                setToolbarPosition(nextPos);
              }}
              icon={
                toolbarPosition === 'left' ? <ArrowDown size={20} /> :
                toolbarPosition === 'bottom' ? <ArrowRight size={20} /> :
                <ArrowLeft size={20} />
              }
              label={
                toolbarPosition === 'left' ? 'Move to Bottom' :
                toolbarPosition === 'bottom' ? 'Move to Right' :
                'Move to Left'
              }
              className="text-gray-600 hover:bg-gray-100"
            />

            <ToolButton
              active={false}
              onClick={clearBoard}
              icon={<Trash2 size={20} />}
              label="Clear"
              className="text-red-500 hover:bg-red-50"
            />
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 bg-white cursor-crosshair relative" style={{ touchAction: 'none' }}>
          <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
               style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 0)', backgroundSize: '24px 24px' }}
          />
          
          <Stage
            width={window.innerWidth}
            height={window.innerHeight - 64}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            ref={stageRef}
          >
            <Layer>
              {elements.map((el) => {
                if (el.type === 'pencil' || el.type === 'eraser') {
                  return (
                    <Line
                      key={el.id}
                      points={el.points}
                      stroke={el.color}
                      strokeWidth={el.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={
                        el.type === 'eraser' ? 'destination-out' : 'source-over'
                      }
                    />
                  );
                } else if (el.type === 'rect') {
                  return (
                    <Rect
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      stroke={el.color}
                      strokeWidth={el.strokeWidth}
                    />
                  );
                } else if (el.type === 'circle') {
                  return (
                    <Circle
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      radius={el.radius}
                      stroke={el.color}
                      strokeWidth={el.strokeWidth}
                    />
                  );
                }
                return null;
              })}

              {/* Remote Cursors */}
              {Array.from(remoteCursors.values()).map((cursor) => {
                const user = users.find(u => u.id === cursor.userId);
                if (!user) return null;

                return (
                  <React.Fragment key={cursor.userId}>
                    {/* Cursor pointer - larger and more visible */}
                    <Line
                      points={[
                        cursor.x, cursor.y,
                        cursor.x, cursor.y + 20,
                        cursor.x + 6, cursor.y + 15,
                        cursor.x + 10, cursor.y + 25,
                        cursor.x + 13, cursor.y + 23,
                        cursor.x + 9, cursor.y + 13,
                        cursor.x + 16, cursor.y + 13,
                        cursor.x, cursor.y
                      ]}
                      fill={user.color}
                      stroke="#ffffff"
                      strokeWidth={2}
                      closed
                      shadowColor="black"
                      shadowBlur={3}
                      shadowOpacity={0.5}
                    />
                    {/* User name label background */}
                    <Rect
                      x={cursor.x + 18}
                      y={cursor.y + 10}
                      width={user.name.length * 8 + 16}
                      height={24}
                      fill={user.color}
                      cornerRadius={6}
                      shadowColor="black"
                      shadowBlur={6}
                      shadowOpacity={0.4}
                    />
                    {/* User name text */}
                    <Text
                      x={cursor.x + 26}
                      y={cursor.y + 14}
                      text={user.name}
                      fontSize={14}
                      fill="#ffffff"
                      fontStyle="bold"
                      fontFamily="Arial"
                    />
                  </React.Fragment>
                );
              })}
            </Layer>
          </Stage>
        </main>
      </div>

      {/* Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-3">{modal.title}</h3>
              <p className="text-gray-600 whitespace-pre-line leading-relaxed">{modal.message}</p>
            </div>
            <div className="flex gap-3 p-4 bg-gray-50 border-t border-gray-200">
              {modal.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setModal({ isOpen: false, title: '', message: '', type: 'alert' })}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => modal.onConfirm?.()}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-[#005a9c] text-white font-medium hover:bg-[#004a80] transition-colors"
                  >
                    Confirm
                  </button>
                </>
              ) : modal.onConfirm ? (
                <>
                  <button
                    onClick={() => setModal({ isOpen: false, title: '', message: '', type: 'alert' })}
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => modal.onConfirm?.()}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-[#005a9c] text-white font-medium hover:bg-[#004a80] transition-colors"
                  >
                    Open in New Tab
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setModal({ isOpen: false, title: '', message: '', type: 'alert' })}
                  className="w-full px-4 py-2.5 rounded-lg bg-[#005a9c] text-white font-medium hover:bg-[#004a80] transition-colors"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  className
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "p-2.5 rounded-xl flex items-center justify-center relative group",
        active ? "bg-[#005a9c] text-white shadow-lg" : "text-gray-500 hover:bg-gray-100",
        className
      )}
      style={{
        transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      {icon}
      <span className="absolute left-full ml-3 px-2 py-1 bg-[#005a9c] text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}

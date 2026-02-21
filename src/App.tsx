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
  LogOut
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
    if (window.confirm('Clear the entire board?')) {
      socket?.emit('clear-board', boardId);
      setElements([]);
    }
  };

  const handleMouseLeave = () => {
    if (socket && boardId) {
      socket.emit('cursor-leave', boardId);
    }
  };

  const copyRoomLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert(`Room link copied! Share this URL to cast to other screens: ${url}`);
  };

  const handleLeaveSession = () => {
    if (window.confirm('Are you sure you want to leave this session?')) {
      socket?.disconnect();
      setShowNamePrompt(true);
      setUserName('');
      setElements([]);
      setUsers([]);
      setRemoteCursors(new Map());
    }
  };

  const handleJoinBoard = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userName.trim()) {
      setShowNamePrompt(false);
    }
  };

  if (showNamePrompt) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#005a9c] to-[#003d6b]">
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#005a9c] rounded-xl flex items-center justify-center">
              <Monitor className="text-white w-7 h-7" />
            </div>
            <div>
              <h1 className="font-bold text-[#005a9c] text-xl">Tata ClassEdge</h1>
              <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">Collaborative Whiteboard</p>
            </div>
          </div>
          <form onSubmit={handleJoinBoard} className="space-y-4">
            <div>
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
            <button
              type="submit"
              disabled={!userName.trim()}
              className="w-full bg-[#005a9c] text-white py-3 rounded-xl font-medium hover:bg-[#004a80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Join Whiteboard
            </button>
          </form>
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
          <div className="absolute top-6 right-6 z-20 bg-white rounded-2xl shadow-xl border border-black/5 p-4 w-64">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
              <Users size={18} className="text-[#005a9c]" />
              <h3 className="font-semibold text-gray-800">Active Users ({users.length})</h3>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{user.name}</p>
                    {user.id === socket?.id && (
                      <p className="text-xs text-gray-500">(You)</p>
                    )}
                  </div>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
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
        <aside className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-20">
          <div className="bg-white p-2 rounded-2xl shadow-xl border border-black/5 flex flex-col gap-1">
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
            <div className="h-px bg-black/5 my-1" />
            <ToolButton 
              active={false} 
              onClick={clearBoard} 
              icon={<Trash2 size={20} />} 
              label="Clear"
              className="text-red-500 hover:bg-red-50"
            />
          </div>

          {/* Color Picker */}
          <div className="bg-white p-3 rounded-2xl shadow-xl border border-black/5 grid grid-cols-2 gap-2">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  "w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110",
                  color === c && "ring-2 ring-black ring-offset-2"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Stroke Width */}
          <div className="bg-white p-3 rounded-2xl shadow-xl border border-black/5 flex flex-col gap-3">
            {STROKE_WIDTHS.map(w => (
              <button
                key={w}
                onClick={() => setStrokeWidth(w)}
                className="flex items-center justify-center group"
              >
                <div 
                  className={cn(
                    "rounded-full bg-gray-400 transition-all",
                    strokeWidth === w ? "bg-black" : "group-hover:bg-gray-600"
                  )}
                  style={{ width: w * 1.5, height: w * 1.5 }}
                />
              </button>
            ))}
          </div>
        </aside>

        {/* Canvas Area */}
        <main className="flex-1 bg-white cursor-crosshair relative">
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
        "p-2.5 rounded-xl transition-all flex items-center justify-center relative group",
        active ? "bg-[#005a9c] text-white shadow-lg" : "text-gray-500 hover:bg-gray-100",
        className
      )}
    >
      {icon}
      <span className="absolute left-full ml-3 px-2 py-1 bg-[#005a9c] text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
        {label}
      </span>
    </button>
  );
}

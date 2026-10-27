import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Path, Rect } from 'react-konva';
import { getStroke } from 'perfect-freehand';
import { HexColorPicker } from 'react-colorful';
import {
  Pencil,
  Eraser,
  RotateCcw,
  Trash2,
  Pipette,
  Check,
  ChevronDown
} from 'lucide-react';
import {
  GAME_CONSTANTS,
  GAME_PHASES
} from '@doodlr/shared';
import { useGame } from '../context/GameContext.jsx';
import { Button } from '@/components/ui/button.jsx';

// Fixed Quick Palette
const QUICK_PALETTE = [
  '#000000', // Black
  '#ffffff', // White
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#78350f', // Brown
  '#64748b'  // Slate Gray
];

// Brush Size Options
const BRUSH_SIZES = [
  { label: 'Fine', size: 3, dot: 'w-1.5 h-1.5' },
  { label: 'Medium', size: 8, dot: 'w-2.5 h-2.5' },
  { label: 'Thick', size: 16, dot: 'w-3.5 h-3.5' },
  { label: 'Marker', size: 28, dot: 'w-5 h-5' }
];

/**
 * Convert perfect-freehand outline points to SVG path data string
 * @param {Array<[number, number]>} outline
 * @returns {string}
 */
function getSvgPathFromStroke(outline) {
  if (!outline || outline.length === 0) return '';
  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...outline[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

export default function DrawingCanvas({ className = '' }) {
  const {
    roomState,
    playerState,
    secretWord,
    turnSummary,
    strokes,
    setStrokes,
    submitStroke,
    undoStroke,
    clearCanvas,
    warningMessage: serverWarning
  } = useGame();

  const containerRef = useRef(null);
  const stageRef = useRef(null);

  // Responsive scale & dimensions
  const [dimensions, setDimensions] = useState({
    width: 1000,
    height: 600,
    scale: 1
  });

  // Active Tool state
  const [tool, setTool] = useState('pen'); // 'pen' | 'eraser'
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(8);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [warningMessage, setWarningMessage] = useState(null);

  // Auto-dismiss warning message after 4s
  useEffect(() => {
    if (!warningMessage) return;
    const timer = setTimeout(() => setWarningMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [warningMessage]);

  // Local drawing state
  const [currentStroke, setCurrentStroke] = useState(null);
  const isDrawingRef = useRef(false);
  const lastEmitTimeRef = useRef(0);
  const currentStrokeIdRef = useRef(null);
  const localPointsRef = useRef([]);

  const myGuestId = playerState?.guestId || localStorage.getItem('doodlr_guest_id');
  const isDrawer =
    roomState?.currentDrawerId === myGuestId &&
    roomState?.phase === GAME_PHASES.DRAWING;

  // Update responsive canvas scale based on container width
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const scale = containerWidth / GAME_CONSTANTS.CANVAS_WIDTH;
      const height = containerWidth * (GAME_CONSTANTS.CANVAS_HEIGHT / GAME_CONSTANTS.CANVAS_WIDTH);
      setDimensions({
        width: containerWidth,
        height,
        scale
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute SVG path strings for all strokes with memoization
  const renderedPaths = useMemo(() => {
    return strokes.map((s) => {
      if (!s.points || s.points.length === 0) return null;
      const outline = getStroke(
        s.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
        {
          size: s.size,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
          simulatePressure: true
        }
      );
      return {
        id: s.id,
        pathData: getSvgPathFromStroke(outline),
        color: s.color,
        tool: s.tool
      };
    });
  }, [strokes]);

  // Compute current local in-progress stroke path
  const currentPathData = useMemo(() => {
    if (!currentStroke || !currentStroke.points || currentStroke.points.length === 0) {
      return null;
    }
    const outline = getStroke(
      currentStroke.points.map((p) => [p.x, p.y, p.pressure ?? 0.5]),
      {
        size: currentStroke.size,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true
      }
    );
    return {
      pathData: getSvgPathFromStroke(outline),
      color: currentStroke.color,
      tool: currentStroke.tool
    };
  }, [currentStroke]);

  // Get logical [1000 x 600] coordinates from pointer event (M-12)
  const getLogicalPoint = useCallback((e) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getRelativePointerPosition() || stage.getPointerPosition();
    if (!pointer) return null;

    const rawPressure = e.evt?.pressure;
    const pressure = typeof rawPressure === 'number' && rawPressure > 0 ? rawPressure : 0.5;

    return {
      x: Math.max(0, Math.min(GAME_CONSTANTS.CANVAS_WIDTH, Math.round(pointer.x * 10) / 10)),
      y: Math.max(0, Math.min(GAME_CONSTANTS.CANVAS_HEIGHT, Math.round(pointer.y * 10) / 10)),
      pressure
    };
  }, []);

  // Pointer Down
  const handlePointerDown = useCallback((e) => {
    if (!isDrawer) return;

    const point = getLogicalPoint(e);
    if (!point) return;

    isDrawingRef.current = true;
    const strokeId = `str_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    currentStrokeIdRef.current = strokeId;
    localPointsRef.current = [point];

    const initialStroke = {
      id: strokeId,
      tool,
      color,
      size: brushSize,
      points: [point],
      isComplete: false
    };

    setCurrentStroke(initialStroke);
    lastEmitTimeRef.current = Date.now();

    // Send initial stroke point
    submitStroke(initialStroke).catch((err) => {
      if (err.message) {
        setWarningMessage(err.message);
      }
    });
  }, [isDrawer, tool, color, brushSize, getLogicalPoint, submitStroke]);

  // Pointer Move (Throttled & batched to avoid flooding Socket.IO)
  const handlePointerMove = useCallback((e) => {
    if (!isDrawer || !isDrawingRef.current) return;

    const point = getLogicalPoint(e);
    if (!point) return;

    localPointsRef.current.push(point);

    // Update local state for immediate 60fps rendering
    setCurrentStroke((prev) => (prev ? { ...prev, points: [...localPointsRef.current] } : null));

    // Throttle socket emission to ~30ms (approx 33 events/sec max)
    const now = Date.now();
    if (now - lastEmitTimeRef.current >= 30) {
      lastEmitTimeRef.current = now;
      submitStroke({
        id: currentStrokeIdRef.current,
        tool,
        color,
        size: brushSize,
        points: [...localPointsRef.current],
        isComplete: false
      }).catch((err) => {
        if (err.message) {
          setWarningMessage(err.message);
        }
      });
    }
  }, [isDrawer, tool, color, brushSize, getLogicalPoint, submitStroke]);

  // Pointer Up / End
  const handlePointerUp = useCallback(() => {
    if (!isDrawer || !isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (localPointsRef.current.length > 0 && currentStrokeIdRef.current) {
      const finalStroke = {
        id: currentStrokeIdRef.current,
        tool,
        color,
        size: brushSize,
        points: [...localPointsRef.current],
        isComplete: true
      };

      // Optimistically add to drawer's strokes to keep it immediately on screen
      setStrokes((prev) => [...prev.filter((s) => s.id !== finalStroke.id), finalStroke]);
      setCurrentStroke(null);
      localPointsRef.current = [];
      currentStrokeIdRef.current = null;

      // Authoritative server submission
      submitStroke(finalStroke).catch((err) => {
        // Rollback on rejection and notify drawer
        setStrokes((prev) => prev.filter((s) => s.id !== finalStroke.id));
        setWarningMessage(err.message || 'Stroke rejected by server');
      });
    } else {
      setCurrentStroke(null);
      localPointsRef.current = [];
      currentStrokeIdRef.current = null;
    }
  }, [isDrawer, tool, color, brushSize, setStrokes, submitStroke]);

  return (
    <div className={`flex flex-col space-y-3 ${className}`}>
      {/* Drawer Canvas Control Bar (Strictly shown to current Drawer only) */}
      {isDrawer && (
        <div className="flex flex-col gap-2">
          {(warningMessage || serverWarning) && (
            <div className="bg-rose-600 text-white text-xs font-bold px-3 py-1.5 rounded border border-rose-700 shadow-sm flex items-center justify-between">
              <span>{warningMessage || serverWarning}</span>
              <button
                onClick={() => setWarningMessage(null)}
                className="text-white hover:text-rose-100 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}
          <div className="arcade-panel p-2.5 flex flex-wrap items-center justify-between gap-3">
            {/* Left: Tools (Pen / Eraser) */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTool('pen')}
                title="Pen Tool"
                className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${tool === 'pen'
                  ? 'bg-blue-600 text-white border border-blue-700 shadow-[0_2px_0_#1d4ed8]'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
              >
                <Pencil className="w-4 h-4" />
                <span>Draw</span>
              </button>

              <button
                onClick={() => setTool('eraser')}
                title="Eraser Tool"
                className={`px-3 py-1.5 rounded transition-all cursor-pointer flex items-center gap-1 text-xs font-bold ${tool === 'eraser'
                  ? 'bg-blue-600 text-white border border-blue-700 shadow-[0_2px_0_#1d4ed8]'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
              >
                <Eraser className="w-4 h-4" />
                <span>Eraser</span>
              </button>
            </div>

            {/* Center: Brush Size Selectors */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded border border-slate-200">
              {BRUSH_SIZES.map((b) => (
                <button
                  key={b.size}
                  onClick={() => setBrushSize(b.size)}
                  title={`${b.label} (${b.size}px)`}
                  className={`w-7 h-7 rounded flex items-center justify-center transition-all cursor-pointer ${brushSize === b.size
                    ? 'bg-white text-blue-600 shadow-xs border border-blue-200'
                    : 'text-slate-400 hover:text-slate-700'
                    }`}
                >
                  <div
                    className={`rounded-full ${b.dot} ${brushSize === b.size ? 'bg-blue-500' : 'bg-slate-400'
                      }`}
                  />
                </button>
              ))}
            </div>

            {/* Color Palette & Custom Picker */}
            <div className="flex items-center gap-1.5 relative">
              {/* Quick 12-Color Palette Swatches */}
              <div className="flex items-center gap-1">
                {QUICK_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c);
                      setTool('pen');
                    }}
                    style={{ backgroundColor: c }}
                    title={c}
                    className={`w-5 h-5 rounded-full border transition-transform cursor-pointer shrink-0 ${color === c && tool === 'pen'
                      ? 'scale-125 border-blue-500 shadow-xs ring-2 ring-blue-400/50'
                      : 'border-slate-300 hover:scale-110'
                      }`}
                  />
                ))}
              </div>

              {/* Custom Color Picker Toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  title="Custom Color Picker"
                  className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer flex items-center gap-1"
                >
                  <div
                    className="w-4 h-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: color }}
                  />
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {/* Color Picker Popover */}
                {showColorPicker && (
                  <div className="absolute top-10 right-0 z-50 p-3 bg-white arcade-panel rounded shadow-xl border border-slate-200 space-y-2">
                    <HexColorPicker
                      color={color}
                      onChange={(newCol) => {
                        setColor(newCol);
                        setTool('pen');
                      }}
                    />
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-700 px-1">
                      <span>{color}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowColorPicker(false)}
                        className="h-6 text-[11px] px-2"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Undo & Clear Actions & Budget Counter */}
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[11px] font-mono px-2 py-1 rounded font-semibold border ${strokes.length > 250
                  ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
                  }`}
                title="Current turn stroke budget"
              >
                {strokes.length}/{GAME_CONSTANTS.MAX_STROKES_PER_TURN}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={undoStroke}
                disabled={strokes.length === 0}
                title="Undo last stroke"
                className="gap-1 cursor-pointer h-8 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Undo</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={clearCanvas}
                disabled={strokes.length === 0}
                title="Clear all strokes"
                className="gap-1 cursor-pointer h-8 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Surface (Logical 1000 x 600, Scaled Responsively) */}
      <div
        ref={containerRef}
        className="w-full bg-white rounded border border-slate-200/90 shadow-sm overflow-hidden relative cursor-crosshair select-none"
        style={{
          aspectRatio: `${GAME_CONSTANTS.CANVAS_WIDTH} / ${GAME_CONSTANTS.CANVAS_HEIGHT}`,
          touchAction: 'none'
        }}
      >
        <Stage
          ref={stageRef}
          x={0}
          y={0}
          width={dimensions.width}
          height={dimensions.height}
          scaleX={dimensions.scale}
          scaleY={dimensions.scale}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Layer 1: Background Canvas (M-10) */}
          <Layer listening={false}>
            <Rect
              x={0}
              y={0}
              width={GAME_CONSTANTS.CANVAS_WIDTH}
              height={GAME_CONSTANTS.CANVAS_HEIGHT}
              fill="#ffffff"
            />
          </Layer>

          {/* Layer 2: Drawing & True Erasing Layer (M-10) */}
          <Layer>
            {/* Confirmed Synchronized Strokes */}
            {renderedPaths.map((item) => {
              if (!item) return null;
              return (
                <Path
                  key={item.id}
                  data={item.pathData}
                  fill={item.tool === 'eraser' ? '#000000' : item.color}
                  globalCompositeOperation={
                    item.tool === 'eraser' ? 'destination-out' : 'source-over'
                  }
                  listening={false}
                />
              );
            })}

            {/* Real-time Local In-Progress Stroke */}
            {currentPathData && (
              <Path
                data={currentPathData.pathData}
                fill={currentPathData.tool === 'eraser' ? '#000000' : currentPathData.color}
                globalCompositeOperation={
                  currentPathData.tool === 'eraser' ? 'destination-out' : 'source-over'
                }
                listening={false}
              />
            )}
          </Layer>
        </Stage>

        {/* Persistent Stroke Limit Indicator for all players (L-05) */}
        {strokes.length >= GAME_CONSTANTS.MAX_STROKES_PER_TURN && (
          <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-700 text-white px-3 py-1 rounded text-xs font-bold pointer-events-none shadow-md flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Stroke Limit Reached ({strokes.length}/{GAME_CONSTANTS.MAX_STROKES_PER_TURN})</span>
          </div>
        )}

        {/* Turn Ended Transition Notice (Preserves canvas until next turn) */}
        {roomState?.phase === GAME_PHASES.TURN_RESULTS && (
          <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur text-white px-3 py-1 rounded text-xs font-bold pointer-events-none shadow-md">
            Final Drawing — The word was "{turnSummary?.secretWord || secretWord || roomState?.secretWord}"
          </div>
        )}
      </div>
    </div>
  );
}

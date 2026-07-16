"use client";

// Number-line fraction model: student splits [0,1] into equal parts, then drags or
// keys a point onto a tick. No point is pre-placed — a default mark could read as a
// suggested answer, so the model starts empty and the readout stays hidden until the
// student actually places one.
import { useRef, useState } from "react";
import { formatFraction, remapCount, snapToTick } from "./model-math";
import { PartsStepper } from "./parts-stepper";
import { ModelReadout } from "./model-readout";

// Geometry lives in viewBox units, not pixels, so it stays correct regardless of the
// SVG's rendered width (the SVG scales via width="100%").
const LINE_START_X = 40;
const LINE_END_X = 560;
const LINE_Y = 40;
const LINE_WIDTH = LINE_END_X - LINE_START_X;

export function NumberLineModel({
  disabled,
  onUseAnswer,
}: {
  disabled?: boolean;
  onUseAnswer: (answer: string) => void;
}) {
  const [parts, setParts] = useState(4);
  const [marked, setMarked] = useState<number | null>(null);
  const draggingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  function handlePartsChange(nextParts: number) {
    // Remap the mark so it keeps the same physical position on the line
    // (2/4 stays where 3/6 would be) instead of jumping to a new tick index.
    setMarked((current) => (current === null ? null : remapCount(current, parts, nextParts)));
    setParts(nextParts);
  }

  function tickFromClientX(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    // The SVG renders at rect.width px but its internal coordinate space is
    // always 600 units wide, so client x must be rescaled into viewBox units
    // before it can be compared against the viewBox line geometry.
    const viewBoxX = ((clientX - rect.left) / rect.width) * 600;
    return snapToTick(viewBoxX, LINE_START_X, LINE_WIDTH, parts);
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setMarked(tickFromClientX(e.clientX));
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (disabled || !draggingRef.current) return;
    setMarked(tickFromClientX(e.clientX));
  }

  function endDrag() {
    draggingRef.current = false;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        setMarked((m) => (m === null ? 0 : Math.min(parts, m + 1)));
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        setMarked((m) => (m === null ? 0 : Math.max(0, m - 1)));
        break;
      case "Home":
        e.preventDefault();
        setMarked(0);
        break;
      case "End":
        e.preventDefault();
        setMarked(parts);
        break;
      default:
        // Leave unhandled keys (Tab, etc.) alone so focus still moves normally.
        break;
    }
  }

  const markedX = marked === null ? null : LINE_START_X + (marked / parts) * LINE_WIDTH;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-muted">Split the line into equal parts, then mark your point.</p>
      <PartsStepper parts={parts} disabled={disabled} onChange={handlePartsChange} />
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={0}
        aria-valuemax={parts}
        aria-valuenow={marked ?? 0}
        aria-valuetext={
          marked === null ? "No point placed yet" : `${marked} of ${parts} parts, equals ${formatFraction(marked, parts)}`
        }
        onKeyDown={handleKeyDown}
        className="rounded-md"
      >
        <svg
          ref={svgRef}
          viewBox="0 0 600 80"
          width="100%"
          aria-hidden="true"
          className="touch-none cursor-pointer select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <line
            x1={LINE_START_X}
            y1={LINE_Y}
            x2={LINE_END_X}
            y2={LINE_Y}
            className="stroke-border-strong"
            strokeWidth={2}
          />
          {Array.from({ length: parts + 1 }, (_, i) => {
            const x = LINE_START_X + (i / parts) * LINE_WIDTH;
            return (
              <line
                key={i}
                x1={x}
                y1={LINE_Y - 10}
                x2={x}
                y2={LINE_Y + 10}
                className="stroke-border-strong"
                strokeWidth={2}
              />
            );
          })}
          <text x={LINE_START_X} y={LINE_Y + 28} textAnchor="middle" className="fill-ink-muted text-xs">
            0
          </text>
          <text x={LINE_END_X} y={LINE_Y + 28} textAnchor="middle" className="fill-ink-muted text-xs">
            1
          </text>
          {markedX !== null ? (
            <>
              {/* Fat transparent hit target: the visible dot is smaller than a comfortable touch target. */}
              <circle cx={markedX} cy={LINE_Y} r={22} fill="transparent" />
              <circle cx={markedX} cy={LINE_Y} r={11} className="fill-focus animate-pop" />
            </>
          ) : null}
        </svg>
      </div>
      {marked !== null ? (
        <ModelReadout lead="You marked" numerator={marked} denominator={parts} onUse={onUseAnswer} disabled={disabled} />
      ) : (
        <p className="text-sm text-ink-faint">Tap the line to place your point.</p>
      )}
    </div>
  );
}


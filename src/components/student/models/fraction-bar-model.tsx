"use client";

// Interactive fraction-bar model: one or two bars, each a single contiguous-fill slider
// (not per-segment toggles) so "shade 3/4" reads as "fill up to here" the way a student
// would color a strip by hand. Shares pointer/keyboard math with the other fraction models
// via model-math so drag, click, and arrow-key behavior stay identical across surfaces.
import { useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import {
  combineBars,
  formatFraction,
  remapCount,
  snapToTick,
  tapFill,
  type BarState,
} from "./model-math";
import { PartsStepper } from "./parts-stepper";
import { ModelReadout } from "./model-readout";
import { Fraction } from "@/components/student/fraction";

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 56;

export function FractionBarModel({
  bars,
  operation,
  disabled,
  onUseAnswer,
}: {
  bars: 1 | 2;
  operation?: "add" | "subtract";
  disabled?: boolean;
  onUseAnswer: (answer: string) => void;
}) {
  const [barStates, setBarStates] = useState<BarState[]>(() =>
    Array.from({ length: bars }, () => ({ parts: 4, shaded: 0 })),
  );
  // Tracks which bar (if any) owns the active pointer drag so a move event that
  // strays outside one bar's svg never bleeds into the other bar's fill.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function updateBar(index: number, updater: (bar: BarState) => BarState) {
    setBarStates((prev) => prev.map((bar, i) => (i === index ? updater(bar) : bar)));
  }

  function handlePartsChange(index: number, nextParts: number) {
    updateBar(index, (bar) => ({
      parts: nextParts,
      shaded: remapCount(bar.shaded, bar.parts, nextParts),
    }));
  }

  // Converts a pointer event's client x into a 0..parts fill count using the svg's own
  // rendered box, so the math holds regardless of how wide the bar renders on screen.
  function fillFromPointer(event: PointerEvent<SVGSVGElement>, parts: number): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const viewBoxX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    return snapToTick(viewBoxX, 0, VIEW_WIDTH, parts);
  }

  function handlePointerDown(index: number, event: PointerEvent<SVGSVGElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingIndex(index);
    // A tap should toggle the segment under the pointer rather than snap to the
    // nearest boundary, or the first segment can become unreachable by tap (see
    // handlePointerMove/fillFromPointer for the drag-sweep behavior, unchanged).
    const rect = event.currentTarget.getBoundingClientRect();
    const viewBoxX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH;
    const fill = tapFill(barStates[index].shaded, viewBoxX, VIEW_WIDTH, barStates[index].parts);
    updateBar(index, (bar) => ({ ...bar, shaded: fill }));
  }

  function handlePointerMove(index: number, event: PointerEvent<SVGSVGElement>) {
    if (disabled || draggingIndex !== index) return;
    const fill = fillFromPointer(event, barStates[index].parts);
    updateBar(index, (bar) => ({ ...bar, shaded: fill }));
  }

  function handlePointerUp() {
    setDraggingIndex(null);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const bar = barStates[index];
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      updateBar(index, (b) => ({ ...b, shaded: Math.min(b.parts, b.shaded + 1) }));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      updateBar(index, (b) => ({ ...b, shaded: Math.max(0, b.shaded - 1) }));
    } else if (event.key === "Home") {
      event.preventDefault();
      updateBar(index, (b) => ({ ...b, shaded: 0 }));
    } else if (event.key === "End") {
      event.preventDefault();
      updateBar(index, (b) => ({ ...b, shaded: bar.parts }));
    }
  }

  // Combining only makes pedagogical sense once both bars share a denominator; a
  // mismatched pair (or a negative subtraction result) falls through to a nudge
  // instead of a fillable answer.
  const combined =
    bars === 2 && operation && barStates[1] && barStates[0].parts === barStates[1].parts
      ? combineBars(operation, barStates[0], barStates[1])
      : null;
  const showCombinedReadout = bars === 2 && Boolean(operation);

  return (
    <div className="flex flex-col gap-6">
      {barStates.map((bar, index) => {
        const label = bars === 2 ? (index === 0 ? "First fraction" : "Second fraction") : "Fraction";
        const segmentWidth = VIEW_WIDTH / bar.parts;

        return (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">{label}</span>
              <div className="flex items-center gap-3">
                <PartsStepper parts={bar.parts} disabled={disabled} onChange={(next) => handlePartsChange(index, next)} />
                <Fraction numerator={bar.shaded} denominator={bar.parts} size="md" />
                <button
                  type="button"
                  aria-label={`Clear ${label.toLowerCase()}`}
                  className="text-sm font-medium text-focus underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
                  disabled={disabled || bar.shaded === 0}
                  onClick={() => updateBar(index, (b) => ({ ...b, shaded: 0 }))}
                >
                  Clear
                </button>
              </div>
            </div>
            <div
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={label}
              aria-valuemin={0}
              aria-valuemax={bar.parts}
              aria-valuenow={bar.shaded}
              aria-valuetext={`${bar.shaded} of ${bar.parts} parts shaded, equals ${formatFraction(bar.shaded, bar.parts)}`}
              onKeyDown={(event) => handleKeyDown(index, event)}
              className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <svg
                viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                width="100%"
                aria-hidden="true"
                className="touch-none cursor-pointer select-none"
                onPointerDown={(event) => handlePointerDown(index, event)}
                onPointerMove={(event) => handlePointerMove(index, event)}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {Array.from({ length: bar.parts }, (_, segment) => (
                  <rect
                    key={segment}
                    x={segment * segmentWidth}
                    y={4}
                    width={segmentWidth}
                    height={VIEW_HEIGHT - 8}
                    strokeWidth={1.5}
                    className={segment < bar.shaded ? "fill-focus stroke-border-strong" : "fill-surface-2 stroke-border-strong"}
                  />
                ))}
              </svg>
            </div>
            {!showCombinedReadout ? (
              <ModelReadout lead="You shaded" numerator={bar.shaded} denominator={bar.parts} onUse={onUseAnswer} disabled={disabled} />
            ) : null}
          </div>
        );
      })}
      {showCombinedReadout ? (
        combined ? (
          <ModelReadout
            lead={operation === "add" ? "Together that's" : "The difference is"}
            numerator={combined.numerator}
            denominator={combined.denominator}
            onUse={onUseAnswer}
            disabled={disabled}
          />
        ) : (
          <p className="text-sm text-ink-faint">Split both bars into the same number of parts to combine them.</p>
        )
      ) : null}
    </div>
  );
}

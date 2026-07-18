import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { createPortal } from "react-dom";
import { tx } from "../../i18n";

export type CareerPrimaryView = "overview" | "projects" | "game-plan";
export type CareerPageDirection = "previous" | "next";

const VIEW_ORDER: CareerPrimaryView[] = ["overview", "projects", "game-plan"];
const PAGE_VARIANTS = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 62 : -62,
    filter: "blur(3px)",
  }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -38 : 38,
    filter: "blur(2px)",
  }),
};

function viewLabel(view: CareerPrimaryView) {
  if (view === "overview") return tx("总览", "Overview");
  if (view === "projects") return tx("训练项目", "Training projects");
  return tx("游戏计划", "Game plan");
}

interface CareerPageCarouselProps {
  view: CareerPrimaryView;
  direction: CareerPageDirection;
  onNavigate: (view: CareerPrimaryView, direction: CareerPageDirection) => void;
  showNavigationControls?: boolean;
  children: ReactNode;
}

export function CareerPageCarousel({
  view,
  direction,
  onNavigate,
  showNavigationControls = true,
  children,
}: CareerPageCarouselProps) {
  const index = VIEW_ORDER.indexOf(view);
  const previous = VIEW_ORDER[(index - 1 + VIEW_ORDER.length) % VIEW_ORDER.length];
  const next = VIEW_ORDER[(index + 1) % VIEW_ORDER.length];
  const [transitionLocked, setTransitionLocked] = useState(false);
  const previousView = useRef(view);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    setTransitionLocked(true);
    const timer = window.setTimeout(() => setTransitionLocked(false), shouldReduceMotion ? 80 : 430);
    return () => window.clearTimeout(timer);
  }, [shouldReduceMotion, view]);

  const navigate = (target: CareerPrimaryView, targetDirection: CareerPageDirection) => {
    if (transitionLocked || target === view) return;
    setTransitionLocked(true);
    onNavigate(target, targetDirection);
  };

  const navigateToDot = (target: CareerPrimaryView) => {
    const targetIndex = VIEW_ORDER.indexOf(target);
    const forward = (targetIndex - index + VIEW_ORDER.length) % VIEW_ORDER.length;
    const backward = (index - targetIndex + VIEW_ORDER.length) % VIEW_ORDER.length;
    navigate(target, forward <= backward ? "next" : "previous");
  };

  const directionValue = direction === "next" ? 1 : -1;
  const navigationControls = (
    <>
      <button
        type="button"
        className="career-page-arrow career-page-arrow-left"
        aria-label={tx(`上一页：${viewLabel(previous)}`, `Previous: ${viewLabel(previous)}`)}
        disabled={transitionLocked}
        onClick={() => navigate(previous, "previous")}
      >
        <ChevronLeft size={22} />
        <span>{viewLabel(previous)}</span>
      </button>
      <button
        type="button"
        className="career-page-arrow career-page-arrow-right"
        aria-label={tx(`下一页：${viewLabel(next)}`, `Next: ${viewLabel(next)}`)}
        disabled={transitionLocked}
        onClick={() => navigate(next, "next")}
      >
        <ChevronRight size={22} />
        <span>{viewLabel(next)}</span>
      </button>
      <nav className="career-page-position" aria-label={tx("切换生涯页面", "Switch Career page")}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div>
          {VIEW_ORDER.map((target) => (
            <button
              type="button"
              key={target}
              className={target === view ? "active" : ""}
              aria-label={viewLabel(target)}
              aria-current={target === view ? "page" : undefined}
              title={viewLabel(target)}
              disabled={target === view || transitionLocked}
              onClick={() => navigateToDot(target)}
            />
          ))}
        </div>
        <b>{viewLabel(view)}</b>
      </nav>
    </>
  );

  return (
    <>
      <div className="career-page-carousel">
        <AnimatePresence initial={false} mode="popLayout" custom={directionValue}>
          <motion.div
            className="career-page-stage"
            key={view}
            custom={directionValue}
            variants={PAGE_VARIANTS}
            initial="enter"
            animate="center"
            exit="exit"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.38, ease: [0.22, 0.72, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
      {!showNavigationControls || typeof document === "undefined"
        ? null
        : createPortal(navigationControls, document.body)}
    </>
  );
}

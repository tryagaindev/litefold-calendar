const CLICK_SUPPRESSION_RELEASE_DELAY = 400;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SCROLL_IDLE_DELAY = 120;
const SNAP_TOLERANCE = 1;
/** Coordinates native horizontal scroll-snap month paging and its lifecycle state. */
export class SwipeGestureController {
    options;
    activePointers = new Set();
    blockedPointers = new Set();
    connectionGeneration = 0;
    connectedDom = null;
    generation = 0;
    gestureInvalidated = false;
    gesturePointerId = null;
    idleTimer = null;
    isRecentering = false;
    isResolving = false;
    lastHorizontalWheelTime = null;
    pagingBlockedUntilTerminal = false;
    resizeObserver = null;
    supportsScrollEnd = false;
    suppressNextClick = false;
    suppressNextClickTimer = null;
    suppressedPointerId = null;
    touchContactCount = 0;
    transactionConsumed = false;
    transactionSequence = 0;
    constructor(options) {
        this.options = options;
    }
    /** Connects the native pager after its stable DOM has been mounted. */
    connect(dom) {
        if (!this.options.enabled) {
            return;
        }
        if (this.connectedDom === dom) {
            this.recenter(dom);
            return;
        }
        this.disconnect(false);
        this.connectedDom = dom;
        const viewport = dom.swipeViewport;
        viewport.addEventListener("pointerdown", this.handlePointerDown, { passive: true });
        viewport.addEventListener("scroll", this.handleScroll, { passive: true });
        this.supportsScrollEnd = "onscrollend" in viewport;
        if (this.supportsScrollEnd) {
            viewport.addEventListener("scrollend", this.handleScrollEnd);
        }
        viewport.addEventListener("touchstart", this.handleTouchStart, { passive: true });
        viewport.addEventListener("wheel", this.handleWheel, { passive: true });
        this.options.host.addEventListener("click", this.handleClickCapture, true);
        this.options.host.addEventListener("pointerdown", this.handleHostPointerDown, {
            capture: true,
            passive: true
        });
        viewport.ownerDocument.addEventListener("pointercancel", this.handlePointerEnd, true);
        viewport.ownerDocument.addEventListener("pointerup", this.handlePointerEnd, true);
        viewport.ownerDocument.addEventListener("touchcancel", this.handleTouchEnd, true);
        viewport.ownerDocument.addEventListener("touchend", this.handleTouchEnd, true);
        const ResizeObserverConstructor = this.options.window?.ResizeObserver;
        if (ResizeObserverConstructor !== undefined) {
            const connectionGeneration = this.connectionGeneration;
            let observer = null;
            observer = new ResizeObserverConstructor((entries) => {
                if (observer !== this.resizeObserver ||
                    connectionGeneration !== this.connectionGeneration ||
                    this.connectedDom !== dom || this.options.getDom() !== dom ||
                    !viewport.isConnected || !entries.some((entry) => entry.target === viewport)) {
                    return;
                }
                this.clear();
            });
            this.resizeObserver = observer;
            try {
                observer.observe(viewport);
            }
            catch (cause) {
                this.disconnect(false);
                throw cause;
            }
        }
        this.recenter(dom);
    }
    /** Suppresses only the touch-generated click associated with a native pan. */
    handleClickCapture = (event) => {
        if (!this.suppressNextClick) {
            return;
        }
        const pointerId = "pointerId" in event ? event.pointerId : undefined;
        const firesTouchEvents = "sourceCapabilities" in event &&
            event.sourceCapabilities?.firesTouchEvents === true;
        if (typeof pointerId === "number" && pointerId >= 0 &&
            this.suppressedPointerId !== null && pointerId !== this.suppressedPointerId) {
            return;
        }
        if ((typeof pointerId !== "number" || pointerId < 0) && !firesTouchEvents &&
            "detail" in event &&
            event.detail === 0) {
            return;
        }
        this.clearClickSuppression();
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    /** Clears active scrolling while retaining the mounted pager listeners. */
    clear(mutateHost = true) {
        const preserveActiveClickGuard = this.suppressNextClick &&
            (this.activePointers.size > 0 || this.blockedPointers.size > 0 ||
                this.touchContactCount > 0 || this.pagingBlockedUntilTerminal);
        this.generation += 1;
        this.transactionSequence += 1;
        this.cancelIdleTimer();
        this.transactionConsumed = true;
        this.blockActiveGesture();
        if (!preserveActiveClickGuard) {
            this.clearClickSuppression();
        }
        if (mutateHost) {
            this.options.host.removeAttribute("data-lfc-swipe-state");
            const dom = this.connectedDom;
            if (dom !== null) {
                this.recenter(dom);
            }
        }
    }
    /** Removes pager listeners and cancels every pending callback. */
    disconnect(mutateHost = true) {
        const dom = this.connectedDom;
        this.connectedDom = null;
        this.connectionGeneration += 1;
        this.generation += 1;
        this.transactionSequence += 1;
        this.cancelIdleTimer();
        this.resetGestureTracking();
        this.lastHorizontalWheelTime = null;
        this.transactionConsumed = false;
        this.clearClickSuppression();
        if (mutateHost) {
            this.options.host.removeAttribute("data-lfc-swipe-state");
        }
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (dom === null) {
            return;
        }
        const viewport = dom.swipeViewport;
        viewport.removeEventListener("pointerdown", this.handlePointerDown);
        viewport.removeEventListener("scroll", this.handleScroll);
        if (this.supportsScrollEnd) {
            viewport.removeEventListener("scrollend", this.handleScrollEnd);
        }
        this.supportsScrollEnd = false;
        viewport.removeEventListener("touchstart", this.handleTouchStart);
        viewport.removeEventListener("wheel", this.handleWheel);
        this.options.host.removeEventListener("click", this.handleClickCapture, true);
        this.options.host.removeEventListener("pointerdown", this.handleHostPointerDown, true);
        viewport.ownerDocument.removeEventListener("pointercancel", this.handlePointerEnd, true);
        viewport.ownerDocument.removeEventListener("pointerup", this.handlePointerEnd, true);
        viewport.ownerDocument.removeEventListener("touchcancel", this.handleTouchEnd, true);
        viewport.ownerDocument.removeEventListener("touchend", this.handleTouchEnd, true);
    }
    /** Recenters and clears transient state before the live 42-cell grid is rerendered. */
    prepareForRender(dom) {
        if (!this.options.enabled) {
            return;
        }
        if (this.connectedDom !== dom) {
            this.connect(dom);
            return;
        }
        this.clear();
    }
    armClickSuppression(pointerId) {
        this.suppressNextClick = true;
        this.suppressedPointerId = pointerId;
        if (this.suppressNextClickTimer !== null) {
            this.options.window?.clearTimeout(this.suppressNextClickTimer);
            this.suppressNextClickTimer = null;
        }
    }
    cancelIdleTimer() {
        if (this.idleTimer === null) {
            return;
        }
        this.options.window?.clearTimeout(this.idleTimer);
        this.idleTimer = null;
    }
    clearClickSuppression() {
        if (this.suppressNextClickTimer !== null) {
            this.options.window?.clearTimeout(this.suppressNextClickTimer);
            this.suppressNextClickTimer = null;
        }
        this.suppressNextClick = false;
        this.suppressedPointerId = null;
    }
    blockActiveGesture() {
        if (this.activePointers.size > 0 || this.touchContactCount > 0 ||
            this.pagingBlockedUntilTerminal) {
            for (const pointerId of this.activePointers) {
                this.blockedPointers.add(pointerId);
            }
            this.pagingBlockedUntilTerminal = true;
            this.gestureInvalidated = true;
        }
        else {
            this.blockedPointers.clear();
            this.gestureInvalidated = false;
            this.touchContactCount = 0;
        }
        this.activePointers.clear();
        this.gesturePointerId = null;
    }
    beginTransaction() {
        this.cancelIdleTimer();
        this.transactionSequence += 1;
        this.transactionConsumed = false;
    }
    beginContactTransaction() {
        this.lastHorizontalWheelTime = null;
        this.beginTransaction();
    }
    resetGestureTracking() {
        this.activePointers.clear();
        this.blockedPointers.clear();
        this.gestureInvalidated = false;
        this.gesturePointerId = null;
        this.pagingBlockedUntilTerminal = false;
        this.touchContactCount = 0;
    }
    closestCandidate(dom) {
        const viewport = dom.swipeViewport;
        const centerOffset = this.clampScrollOffset(viewport, this.getStartOffset(dom.grid));
        const maximumOffset = this.getMaximumScrollOffset(viewport);
        const rawOffset = viewport.scrollLeft;
        const observedOffset = this.clampScrollOffset(viewport, rawOffset);
        const centerCandidate = { amount: 0, offset: centerOffset };
        const candidates = [centerCandidate];
        if (!this.gestureInvalidated) {
            if (dom.previousLane.hasAttribute("data-lfc-page-available")) {
                candidates.push({ amount: -1, offset: this.getLaneOffset(dom.previousLane, dom) });
            }
            if (dom.nextLane.hasAttribute("data-lfc-page-available")) {
                candidates.push({ amount: 1, offset: this.getLaneOffset(dom.nextLane, dom) });
            }
        }
        const closest = candidates.reduce((currentClosest, candidate) => Math.abs(candidate.offset - observedOffset) <
            Math.abs(currentClosest.offset - observedOffset)
            ? candidate
            : currentClosest);
        if (rawOffset < -SNAP_TOLERANCE || rawOffset > maximumOffset + SNAP_TOLERANCE) {
            return centerCandidate;
        }
        if (this.prefersReducedMotion() ||
            Math.abs(closest.offset - observedOffset) <= SNAP_TOLERANCE) {
            return closest;
        }
        return centerCandidate;
    }
    getLaneOffset(lane, dom) {
        const viewport = dom.swipeViewport;
        const laneStart = this.getStartOffset(lane);
        const gridStart = this.getStartOffset(dom.grid);
        const aligned = laneStart < gridStart
            ? laneStart
            : laneStart + lane.offsetWidth - viewport.clientWidth;
        return this.clampScrollOffset(viewport, aligned);
    }
    getStartOffset(element) {
        //The positioned viewport is the direct flex children's offset parent.
        return element.offsetLeft;
    }
    prefersReducedMotion() {
        const hostWindow = this.options.window;
        return hostWindow !== null && typeof hostWindow.matchMedia === "function" &&
            hostWindow.matchMedia(REDUCED_MOTION_QUERY).matches;
    }
    clampScrollOffset(viewport, offset) {
        return Math.max(0, Math.min(this.getMaximumScrollOffset(viewport), offset));
    }
    getMaximumScrollOffset(viewport) {
        return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    }
    handlePointerDown = (event) => {
        if (!this.options.enabled || (event.pointerType !== "touch" && event.pointerType !== "pen")) {
            return;
        }
        if (this.pagingBlockedUntilTerminal) {
            if (this.blockedPointers.size > 0) {
                this.blockedPointers.add(event.pointerId);
                return;
            }
            const dom = this.connectedDom;
            this.resetGestureTracking();
            if (dom !== null) {
                this.recenter(dom);
            }
        }
        if (this.activePointers.size === 0) {
            this.gestureInvalidated = false;
            this.gesturePointerId = event.pointerId;
            this.beginContactTransaction();
        }
        else if (!this.activePointers.has(event.pointerId)) {
            this.gestureInvalidated = true;
        }
        this.activePointers.add(event.pointerId);
    };
    handlePointerEnd = (event) => {
        const wasActive = this.activePointers.delete(event.pointerId);
        const wasBlocked = this.blockedPointers.delete(event.pointerId);
        if (!wasActive && !wasBlocked) {
            return;
        }
        if (event.pointerId === this.suppressedPointerId &&
            (event.type === "pointerup" || this.touchContactCount === 0)) {
            this.scheduleClickSuppressionRelease();
        }
        if (this.activePointers.size === 0 && this.blockedPointers.size === 0 &&
            this.touchContactCount === 0) {
            this.pagingBlockedUntilTerminal = false;
            this.scheduleIdleResolution();
        }
    };
    handleHostPointerDown = () => {
        if (this.activePointers.size === 0 && this.blockedPointers.size === 0 &&
            this.touchContactCount === 0) {
            this.clearClickSuppression();
        }
    };
    handleScroll = () => {
        const dom = this.connectedDom;
        if (!this.options.enabled || dom === null || this.isResolving) {
            return;
        }
        const centerOffset = this.clampScrollOffset(dom.swipeViewport, this.getStartOffset(dom.grid));
        const observedOffset = this.clampScrollOffset(dom.swipeViewport, dom.swipeViewport.scrollLeft);
        if (Math.abs(observedOffset - centerOffset) <= SNAP_TOLERANCE) {
            this.isRecentering = false;
            this.options.host.removeAttribute("data-lfc-swipe-state");
            this.cancelIdleTimer();
            return;
        }
        this.isRecentering = false;
        this.options.host.setAttribute("data-lfc-swipe-state", "scrolling");
        if (this.gesturePointerId !== null) {
            this.armClickSuppression(this.gesturePointerId);
        }
        this.scheduleIdleResolution();
    };
    handleScrollEnd = () => {
        this.cancelIdleTimer();
        if (this.pagingBlockedUntilTerminal) {
            const dom = this.connectedDom;
            if (dom !== null) {
                this.options.host.removeAttribute("data-lfc-swipe-state");
                this.recenter(dom);
            }
            return;
        }
        if (this.activePointers.size > 0 || this.touchContactCount > 0) {
            this.scheduleIdleResolution();
            return;
        }
        this.resolveSnap();
    };
    handleTouchStart = (event) => {
        const startsFreshGesture = this.touchContactCount === 0 && event.touches.length === 1 &&
            this.activePointers.size === 0 && this.blockedPointers.size === 0 &&
            !this.pagingBlockedUntilTerminal;
        this.touchContactCount = event.touches.length;
        if (startsFreshGesture) {
            this.beginContactTransaction();
        }
        if (this.pagingBlockedUntilTerminal || event.touches.length > 1) {
            this.gestureInvalidated = true;
        }
    };
    handleTouchEnd = (event) => {
        this.touchContactCount = event.touches.length;
        if (event.type === "touchcancel") {
            this.gestureInvalidated = true;
        }
        if (this.touchContactCount === 0 && this.activePointers.size === 0 &&
            this.blockedPointers.size === 0) {
            this.pagingBlockedUntilTerminal = false;
            this.scheduleClickSuppressionRelease();
            this.scheduleIdleResolution();
        }
    };
    handleWheel = (event) => {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
            return;
        }
        const startsFreshBurst = this.lastHorizontalWheelTime === null ||
            event.timeStamp < this.lastHorizontalWheelTime ||
            event.timeStamp - this.lastHorizontalWheelTime > SCROLL_IDLE_DELAY;
        this.lastHorizontalWheelTime = event.timeStamp;
        if (startsFreshBurst && !this.pagingBlockedUntilTerminal &&
            this.activePointers.size === 0 && this.touchContactCount === 0) {
            this.beginTransaction();
        }
        this.scheduleIdleResolution();
    };
    recenter(dom) {
        if (!this.options.enabled) {
            dom.swipeViewport.scrollLeft = 0;
            return;
        }
        this.isRecentering = true;
        dom.swipeViewport.scrollLeft = this.clampScrollOffset(dom.swipeViewport, this.getStartOffset(dom.grid));
        this.options.host.removeAttribute("data-lfc-swipe-state");
    }
    resolveSnap() {
        const dom = this.connectedDom;
        if (this.isResolving || dom === null) {
            return;
        }
        if (!this.options.enabled || !this.options.canInteract() || this.options.getDom() !== dom) {
            this.clear();
            return;
        }
        if (this.transactionConsumed) {
            this.cancelIdleTimer();
            this.options.host.removeAttribute("data-lfc-swipe-state");
            this.recenter(dom);
            return;
        }
        const candidate = this.closestCandidate(dom);
        if (candidate.amount === 0) {
            this.transactionConsumed = true;
            this.cancelIdleTimer();
            this.options.host.removeAttribute("data-lfc-swipe-state");
            this.recenter(dom);
            if (!this.pagingBlockedUntilTerminal) {
                this.gestureInvalidated = false;
                this.gesturePointerId = null;
            }
            return;
        }
        const restoreSuppression = this.suppressNextClick;
        const pointerId = this.suppressedPointerId;
        this.transactionConsumed = true;
        this.isResolving = true;
        this.cancelIdleTimer();
        this.options.host.removeAttribute("data-lfc-swipe-state");
        try {
            this.options.navigate(candidate.amount);
        }
        finally {
            this.isResolving = false;
        }
        const currentDom = this.connectedDom;
        if (currentDom !== null && this.options.canInteract() && this.options.getDom() === currentDom) {
            this.recenter(currentDom);
            if (restoreSuppression && pointerId !== null) {
                this.armClickSuppression(pointerId);
                this.scheduleClickSuppressionRelease();
            }
        }
        this.gestureInvalidated = false;
        this.gesturePointerId = null;
    }
    scheduleClickSuppressionRelease() {
        if (!this.suppressNextClick) {
            return;
        }
        if (this.suppressNextClickTimer !== null) {
            this.options.window?.clearTimeout(this.suppressNextClickTimer);
        }
        this.suppressNextClickTimer = this.options.window?.setTimeout(() => {
            this.suppressNextClick = false;
            this.suppressedPointerId = null;
            this.suppressNextClickTimer = null;
        }, CLICK_SUPPRESSION_RELEASE_DELAY) ?? null;
    }
    scheduleIdleResolution() {
        if (this.connectedDom === null || this.isRecentering) {
            return;
        }
        this.cancelIdleTimer();
        const generation = this.generation;
        const transactionSequence = this.transactionSequence;
        const dom = this.connectedDom;
        this.idleTimer = this.options.window?.setTimeout(() => {
            this.idleTimer = null;
            if (generation === this.generation &&
                transactionSequence === this.transactionSequence &&
                dom === this.connectedDom && this.options.getDom() === dom &&
                this.activePointers.size === 0 && this.touchContactCount === 0) {
                this.resolveSnap();
            }
        }, SCROLL_IDLE_DELAY) ?? null;
    }
}
//# sourceMappingURL=swipe.js.map
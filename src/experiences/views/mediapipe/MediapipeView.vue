<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import DebugManager from '../../managers/DebugManager';
import type { MediapipeHandsSnapshot } from '../../managers/MediapipeManager';

type HandPointState = {
    visible: boolean;
    x: number;
    y: number;
};

const isDebug = ref<boolean>(DebugManager.isActive);

const leftPoint = reactive<HandPointState>({ visible: false, x: 0.5, y: 0.5 });
const rightPoint = reactive<HandPointState>({ visible: false, x: 0.5, y: 0.5 });

const leftTarget = reactive({ x: 0.5, y: 0.5 });
const rightTarget = reactive({ x: 0.5, y: 0.5 });

const leftIsFist = ref<boolean>(false);

const SMOOTHING = 0.18;
let rafId: number | null = null;

const toPercent = (n: number): string => `${Math.max(0, Math.min(1, n)) * 100}%`;

const leftStyle = computed(() => ({
    left: toPercent(1 - leftPoint.x),
    top: toPercent(leftPoint.y),
}));

const rightStyle = computed(() => ({
    left: toPercent(1 - rightPoint.x),
    top: toPercent(rightPoint.y),
}));

const onHashChange = (): void => {
    isDebug.value = DebugManager.isActive;
};

const onHandUpdate = (e: Event): void => {
    const snapshot = (e as CustomEvent<MediapipeHandsSnapshot>).detail;

    const left = snapshot.left;
    if (left) {
        leftPoint.visible = true;
        const p = left.isFist && left.fist ? left.fist : left.indexTip;
        leftTarget.x = p.x;
        leftTarget.y = p.y;
        leftIsFist.value = !!left.isFist;
    } else {
        leftPoint.visible = false;
        leftIsFist.value = false;
    }

    const right = snapshot.right;
    if (right) {
        rightPoint.visible = true;
        const p = right.indexTip;
        rightTarget.x = p.x;
        rightTarget.y = p.y;
    } else {
        rightPoint.visible = false;
    }
};

const tick = (): void => {
    if (leftPoint.visible) {
        leftPoint.x += (leftTarget.x - leftPoint.x) * SMOOTHING;
        leftPoint.y += (leftTarget.y - leftPoint.y) * SMOOTHING;
    }
    if (rightPoint.visible) {
        rightPoint.x += (rightTarget.x - rightPoint.x) * SMOOTHING;
        rightPoint.y += (rightTarget.y - rightPoint.y) * SMOOTHING;
    }
    rafId = window.requestAnimationFrame(tick);
};

onMounted(() => {
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('hand:update', onHandUpdate as EventListener);
    rafId = window.requestAnimationFrame(tick);
    console.log("MediapipeView mounted, event listeners added, tick started");
});

onBeforeUnmount(() => {
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('hand:update', onHandUpdate as EventListener);
    if (rafId !== null) window.cancelAnimationFrame(rafId);
});
</script>

<template>
    <div class="hand-overlay">
        <div v-show="leftPoint.visible" class="left-hand dot" :class="{ 'dot--grab': leftIsFist }" :style="leftStyle"></div>
        <div v-show="rightPoint.visible" class="right-hand dot" :style="rightStyle"></div>
    </div>

    <div class="webcam-container" :class="{ 'debug': isDebug }">
        <video id="webcam" class="webcam" autoplay playsinline></video>
        <canvas class="output_canvas" id="output_canvas"></canvas>
    </div>
</template>

<style lang="scss" scoped>
/* WEBCAM CONTAINER */
.webcam-container {
    position: absolute;
    bottom: 50px;
    left: 50px;
    width: 320px;
    aspect-ratio: 4 / 3;
    overflow: hidden;

    &:not(.debug) {
        visibility: hidden;
    }
}

/* VIDEO + CANVAS SUPERPOSÉS */
.webcam,
.output_canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: scaleX(-1);
}

.webcam {
    object-fit: contain;
}

.output_canvas {
    pointer-events: none;
    object-fit: contain;
}

/* BUTTON */
.webcamButton {
    position: absolute;
    top: 10px;
    left: 10px;
    transform: translate(-50%, -50%);
    z-index: 10;
    padding: 12px 20px;
    font-size: 16px;
    cursor: pointer;
}

/* DOTS */
.hand-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
}

.dot {
    position: absolute;
    width: 78px;
    height: 78px;
    filter: blur(1px) drop-shadow(0 0 6px #FFF);
    border: 1px solid #FFF;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    overflow: hidden;
}

/* the filling layer */
.dot::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);

    transform: scale(0); /* start from center */
    transform-origin: center;
    transition: transform 0.25s ease-out;
}

/* grab state */
.dot--grab {
    transition: transform 0.1s ease-out;
}

/* trigger fill */
.dot--grab::before {
    transform: scale(1); /* expands to edges */
}

</style>

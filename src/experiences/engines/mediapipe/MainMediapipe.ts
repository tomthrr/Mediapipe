import {
    HandLandmarker,
    FilesetResolver,
    DrawingUtils
} from "@mediapipe/tasks-vision";
import MediapipeManager from "../../managers/MediapipeManager";

class MainMediapipe {
    declare private handLandmarker: HandLandmarker;
    declare private enableWebcamButton?: HTMLButtonElement;
    declare private video: HTMLVideoElement;
    declare private canvasElement?: HTMLCanvasElement;
    declare private webcamRunning: boolean;
    declare private runningMode: string;
    declare private canvasCtx: CanvasRenderingContext2D | null;

    declare private lastVideoTime;
    declare private results;

    constructor() {
        this.webcamRunning = false;
        this.runningMode = "VIDEO";
        this.lastVideoTime = -1;
        this.canvasCtx = null;
    }

    private _getVideoElement(): HTMLVideoElement | null {
        return document.getElementById("webcam") as HTMLVideoElement | null;
    }

    private _refreshCanvasRefs(): void {
        const canvas = document.getElementById("output_canvas") as HTMLCanvasElement | null;
        this.canvasElement = canvas ?? undefined;
        this.canvasCtx = this.canvasElement?.getContext("2d") ?? null;
    }

    public async init() {
        await this.createHandLandmarker().then(() => {
            console.log("HandLandmarker loaded.");
        });
        this.initCamera();
    }

    private async createHandLandmarker() {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        const baseOptions = {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        };

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                ...baseOptions,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });
    }

    private initCamera() {
        const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;
        if (!hasGetUserMedia()) {
            console.warn("getUserMedia() is not supported by your browser");
            return;
        }

        const tryBindElements = () => {
            const videoEl = this._getVideoElement();
            const canvasEl = document.getElementById("output_canvas") as HTMLCanvasElement | null;
            const btn = document.getElementById("webcamButton") as HTMLButtonElement | null;

            if (videoEl && canvasEl && btn) {
                this.video = videoEl;
                this._refreshCanvasRefs();
                this.enableWebcamButton = btn;
                btn.addEventListener("click", this.enableCam);
            } else {
                // Retry on next frame until the Vue component renders.
                requestAnimationFrame(tryBindElements);
            }
        };

        tryBindElements();
    }

    enableCam = (event: Event) => {
        console.log("enableCam", this.handLandmarker);
        if (!this.handLandmarker) {
            console.log("Wait! objectDetector not loaded yet.");
            return;
        }

        this.webcamRunning = !this.webcamRunning;

        const constraints = {
            video: true
        };

        // Activate the webcam stream.
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            this.video.srcObject = stream;
            this.video.addEventListener("loadeddata", this.predictWebcam, { once: true });
        });
    };

    predictWebcam = async () => {
        // Canvas is optional. If it appears later (debug), hook it up lazily.
        if (!this.canvasElement && !this.canvasCtx) {
            this._refreshCanvasRefs();
        }

        if (this.canvasElement) {
            this.canvasElement.width = this.video.videoWidth;
            this.canvasElement.height = this.video.videoHeight;
        }

        // Now let's start detecting the stream.
        if (this.runningMode === "IMAGE") {
            this.runningMode = "VIDEO";
            await this.handLandmarker.setOptions({ runningMode: "VIDEO" });
        }
        let startTimeMs = performance.now();
        if (this.lastVideoTime !== this.video.currentTime) {
            this.lastVideoTime = this.video.currentTime;
            this.results = this.handLandmarker.detectForVideo(this.video, startTimeMs);
            MediapipeManager.update(this.results, startTimeMs);  // store + dispatch
        }

        // Draw landmarks only when debug canvas is present.
        if (this.canvasCtx && this.canvasElement) {
            this.canvasCtx.save();
            this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            
            // We draw the landmars on top of the video
            if (this.results.landmarks) {
                const drawingUtils = new DrawingUtils(this.canvasCtx);
                for (const landmarks of this.results.landmarks) {
                    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 5 });
                    drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
                }
            }
            this.canvasCtx.restore();
        }

        // Call this function again to keep predicting when the browser is ready.
        if (this.webcamRunning === true) {
            window.requestAnimationFrame(this.predictWebcam);
        }
    };
}   

export default new MainMediapipe();
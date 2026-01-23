const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const timerElement = document.getElementById('timer');

// State management
let lastGestures = {};
let particles = [];
let strokes = [];
let activeStrokes = {};
let gameStartTime = null;
let gameEnded = false;

// --- 1. EFFECT SYSTEM ---

// A simple particle system for the "Confetti" effect
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 100 + 50;
        this.speedX = Math.random() * 50 - 25;
        this.speedY = Math.random() * 50 - 25;
    }
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.size *= 0.96; // Shrink over time
    }
    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

const effects = {
    // Effect 4: Paint Splash
    splash: (ctx, width, height) => {
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw(ctx);
        }
        // Remove tiny particles
        particles = particles.filter(p => p.size > 0.5);
    }
};

// --- 2. GESTURE RECOGNITION LOGIC ---

function isFingerExtended(landmarks, fingerTipIndex, fingerPipIndex) {
    // Simple check: Is the tip higher (lower Y value) than the joint?
    // Note: In MediaPipe, Y coordinates increase downwards.
    return landmarks[fingerTipIndex].y < landmarks[fingerPipIndex].y;
}

function detectGesture(landmarks) {
    // MediaPipe Landmark Indices:
    // Thumb: 4, Index: 8, Middle: 12, Ring: 16, Pinky: 20
    // Joints (PIP/MCP) used for comparison: 2, 6, 10, 14, 18
    
    const indexUp = isFingerExtended(landmarks, 8, 6);
    const middleUp = isFingerExtended(landmarks, 12, 10);
    const ringUp = isFingerExtended(landmarks, 16, 14);
    const pinkyUp = isFingerExtended(landmarks, 20, 18);
    
    // Thumb is tricky because it moves horizontally. 
    // We'll skip it for a simple "Open/Closed" check or check X distance.
    
    let fingersUpCount = 0;
    if (indexUp) fingersUpCount++;
    if (middleUp) fingersUpCount++;
    if (ringUp) fingersUpCount++;
    if (pinkyUp) fingersUpCount++;

    if (fingersUpCount >= 4) return "Open Palm";
    if (fingersUpCount === 0) return "Closed Fist";
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return "Index Finger";
    if (indexUp && middleUp && !ringUp && !pinkyUp) return "Victory";
    
    return "Unknown";
}

// --- 3. MEDIAPIPE SETUP ---

function onResults(results) {
    if (gameEnded) return;

    // Initialize timer on first frame
    if (!gameStartTime) gameStartTime = Date.now();

    // Calculate Time
    const elapsed = Date.now() - gameStartTime;
    const timeLeft = Math.max(0, Math.ceil((60000 - elapsed) / 1000));
    if (timerElement) timerElement.innerText = timeLeft + "s";

    // Game Over Logic
    if (timeLeft <= 0) {
        gameEnded = true;
        
        // Draw Final Static Background (No Video, No Skeletons)
        canvasCtx.save();
        canvasCtx.fillStyle = '#1e1e1e';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Draw Strokes Only
        drawStrokes();
        canvasCtx.restore();

        // Hide Game UI
        statusElement.style.display = 'none';
        timerElement.style.display = 'none';

        // Show Studio Mesmer Website
        document.getElementById('website-content').style.display = 'block';

        if (typeof camera !== 'undefined') camera.stop();
        return;
    }

    // 1. Prepare Canvas
    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // 2. Draw Video Feed
    // Make the main screen a blank canvas
    canvasCtx.fillStyle = '#1e1e1e';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw Strokes
    drawStrokes();

    // Draw the video feed as a small screen on the top right (PIP)
    // Note: Since the canvas is mirrored via CSS, drawing at x=0 puts it on the visual Right.
    const pipWidth = canvasElement.width * 0.25;
    const pipHeight = pipWidth * (9/16);
    canvasCtx.drawImage(results.image, 0, 0, pipWidth, pipHeight);
    canvasCtx.strokeStyle = '#ffffff';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(0, 0, pipWidth, pipHeight);

    // 3. Handle Hand Detection
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusElement.innerText = "Hand Detected!";
        
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            const label = results.multiHandedness && results.multiHandedness[index] ? results.multiHandedness[index].label : index;

            // Draw the skeleton
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

            // Detect Gesture
            const gesture = detectGesture(landmarks);
            
            // Drawing Logic
            if (gesture === "Index Finger") {
                const x = landmarks[8].x * canvasElement.width;
                const y = landmarks[8].y * canvasElement.height;
                
                if (!activeStrokes[label]) {
                    // Start new stroke
                    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                    const newStroke = { color: color, points: [{x, y}] };
                    strokes.push(newStroke);
                    activeStrokes[label] = newStroke;
                } else {
                    // Continue existing stroke
                    activeStrokes[label].points.push({x, y});
                }
            } else {
                delete activeStrokes[label];
            }

            // Display Gesture Name
            canvasCtx.fillStyle = "yellow";
            canvasCtx.font = "30px Arial";
            canvasCtx.fillText(gesture, landmarks[0].x * canvasElement.width, landmarks[0].y * canvasElement.height);

            // Trigger Event on State Change
            const lastGesture = lastGestures[label] || "";
            if (gesture !== lastGesture && gesture !== "Unknown") {
                if (lastGesture === "Closed Fist" && gesture === "Open Palm") {
                    // Special Splash Effect
                    // Use Middle Finger MCP (9) as center of palm
                    const x = landmarks[9].x * canvasElement.width;
                    const y = landmarks[9].y * canvasElement.height;
                    for (let i = 0; i < 200; i++) {
                        const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
                        particles.push(new Particle(x, y, color));
                    }
                }
                lastGestures[label] = gesture;
            }
        }
    } else {
        statusElement.innerText = "Show your hand to the camera";
    }

    // 4. Render Active Effect
    effects.splash(canvasCtx, canvasElement.width, canvasElement.height);

    canvasCtx.restore();
}

function drawStrokes() {
    canvasCtx.lineWidth = 5;
    canvasCtx.lineCap = 'round';
    canvasCtx.lineJoin = 'round';
    for (const stroke of strokes) {
        canvasCtx.strokeStyle = stroke.color;
        canvasCtx.beginPath();
        for (let i = 0; i < stroke.points.length; i++) {
            const p = stroke.points[i];
            i === 0 ? canvasCtx.moveTo(p.x, p.y) : canvasCtx.lineTo(p.x, p.y);
        }
        canvasCtx.stroke();
    }
}

const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({image: videoElement});
    },
    width: 1280,
    height: 720
});

camera.start();

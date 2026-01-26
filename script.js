const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const questionTextElement = document.getElementById('question-text');
const optionsContainerElement = document.getElementById('options-container');

// State management
let lastGestures = {};
let particles = [];
let gameWon = false;
let currentQuestionIndex = 0;
let selectionTimeout = null;
let currentPalmPosition = { x: 0, y: 0 };

// Gesture Lab State
let gestureLabActive = false;
let labState = { x: 0, y: 0, scale: 1, lastHandX: null, lastHandY: null, lastPinchDist: null, isPinching: false };
const triviaData = [
    { question: "Oh hi! We didn't see you there. We're Studio Mesmer. We're a bit shy... how did you even find us?", options: ["Google Search", "Instagram", "Telepathy", "I followed the sparkles"], correctAnswer: 3 },
    { question: "Okay, valid. Since you're here, we should probably ask... what are you looking for?", options: ["Just browsing", "Serious Business", "Digital Sorcery", "A good time"], correctAnswer: 2 },
    { question: "We're really into creative tech. How do you feel about... *gestures vaguely*... the future?", options: ["Scary", "Exciting", "Needs more lasers", "It's already here"], correctAnswer: 2 },
    { question: "Almost ready to show you our work. But first, what's the secret password?", options: ["Password123", "Open Sesame", "Please?", "✨Magic✨"], correctAnswer: 3 },
    { question: "Okay, you seem cool. Ready to enter the studio?", options: ["Born ready", "Maybe later", "Yes!", "Let me in!"], correctAnswer: 0 }
];


// --- 1. EFFECT SYSTEM ---

// A simple particle system for the "Confetti" effect
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 20 + 10;
        this.speedX = Math.random() * 20 - 10;
        this.speedY = Math.random() * 20 - 10;
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

    // Pinch Gesture: Index finger tip and thumb tip are close.
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    if (pinchDist < 0.06) {
        return "Pinch";
    }

    const middleUp = isFingerExtended(landmarks, 12, 10);
    const ringUp = isFingerExtended(landmarks, 16, 14);
    const pinkyUp = isFingerExtended(landmarks, 20, 18);

    let fingersUpCount = 0;
    if (indexUp) fingersUpCount++;
    if (middleUp) fingersUpCount++;
    if (ringUp) fingersUpCount++;
    if (pinkyUp) fingersUpCount++;

    if (fingersUpCount >= 4) return "Open Palm";
    if (fingersUpCount === 0) return "Closed Fist";
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return "Index Finger";
    
    return "Unknown";
}

// --- 3. MEDIAPIPE SETUP ---

function updateTriviaUI() {
    if (gameWon) {
        questionTextElement.style.display = 'none';
        optionsContainerElement.style.display = 'none';
        return;
    }
    const question = triviaData[currentQuestionIndex];
    questionTextElement.innerText = question.question;
    optionsContainerElement.innerHTML = '';

    question.options.forEach(optionText => {
        const box = document.createElement('div');
        box.className = 'option-box';
        box.innerText = optionText;
        optionsContainerElement.appendChild(box);
    });
}

function checkAnswer(selectedIndex) {
    statusElement.innerText = "Vibe check passed! ✨";
    const x = canvasElement.width - currentPalmPosition.x;
    const y = currentPalmPosition.y;
    for (let i = 0; i < 100; i++) {
        particles.push(new Particle(x, y, `hsl(${Math.random() * 60 + 20}, 100%, 70%)`));
    }

    currentQuestionIndex++;
    if (currentQuestionIndex >= triviaData.length) {
        gameWon = true;
        setTimeout(unlockWebsite, 2000);
    } else {
        updateTriviaUI();
    }
    clearTimeout(selectionTimeout);
    selectionTimeout = null;
}

function unlockWebsite() {
    const triviaContainer = document.getElementById('trivia-container');
    if (triviaContainer) triviaContainer.style.display = 'none';
    if (statusElement) statusElement.style.display = 'none';
    canvasElement.style.display = 'none';
    camera.stop();

    document.getElementById('website-content').style.display = 'block';
}

function enterGestureLab() {
    document.getElementById('website-content').style.display = 'none';
    document.getElementById('gesture-lab').style.display = 'block';
    gestureLabActive = true;
    camera.start(); // Restart camera for tracking
}

function exitGestureLab() {
    document.getElementById('gesture-lab').style.display = 'none';
    document.getElementById('website-content').style.display = 'block';
    gestureLabActive = false;
    camera.stop(); // Save resources
}

function updateLabTransform() {
    const viewport = document.getElementById('lab-viewport');
    if (viewport) {
        viewport.style.transform = `translate3d(${labState.x}px, ${labState.y}px, 0) scale(${labState.scale})`;
    }
}

function onResults(results) {
    // --- GESTURE LAB LOGIC ---
    if (gestureLabActive) {
        const labCards = document.querySelectorAll('.lab-card');
        labCards.forEach(card => card.classList.remove('hover'));

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const handsCount = results.multiHandLandmarks.length;

            // --- Single Hand Interactions (Hover, Select, Pan) ---
            if (handsCount === 1) {
                const landmarks = results.multiHandLandmarks[0];
                const gesture = detectGesture(landmarks);
                const handPos = {
                    x: (1 - landmarks[8].x) * window.innerWidth, // Mirrored X for index tip
                    y: landmarks[8].y * window.innerHeight
                };
    
                // Hover Detection
                let cardHovered = false;
                labCards.forEach(card => {
                    const rect = card.getBoundingClientRect();
                    if (handPos.x > rect.left && handPos.x < rect.right && handPos.y > rect.top && handPos.y < rect.bottom) {
                        cardHovered = true;
                        card.classList.add('hover');
    
                        // Selection via Pinch
                        if (gesture === "Pinch") {
                            if (!labState.isPinching) { // Fire only once per pinch action
                                card.classList.toggle('selected');
                            }
                            labState.isPinching = true;
                        } else {
                            labState.isPinching = false;
                        }
                    }
                });
    
                // Panning via Closed Fist
                if (gesture === "Closed Fist") {
                    const currentX = landmarks[9].x * window.innerWidth; // Use palm center for panning
                    const currentY = landmarks[9].y * window.innerHeight;
    
                    if (labState.lastHandX !== null) {
                        const deltaX = currentX - labState.lastHandX;
                        const deltaY = currentY - labState.lastHandY;
                        labState.x += deltaX;
                        labState.y += deltaY;
                    }
                    labState.lastHandX = currentX;
                    labState.lastHandY = currentY;
                } else { // Reset panning state if not a closed fist
                    labState.lastHandX = null;
                    labState.lastHandY = null;
                }
            }
    
            // --- Two Hand Interactions (Zoom) ---
            if (handsCount === 2) {
                const h1 = results.multiHandLandmarks[0][9]; // Palm center of hand 1
                const h2 = results.multiHandLandmarks[1][9]; // Palm center of hand 2
                const dist = Math.hypot(h1.x - h2.x, h1.y - h2.y);
    
                if (labState.lastPinchDist !== null) {
                    const delta = dist - labState.lastPinchDist;
                    labState.scale += delta * 3; // Zoom sensitivity
                    labState.scale = Math.max(0.1, Math.min(labState.scale, 5)); // Clamp zoom
                }
                labState.lastPinchDist = dist;
            } else {
                labState.lastPinchDist = null;
            }
        } else {
            // Reset all tracking states if no hands are visible
            labState.lastHandX = null;
            labState.lastHandY = null;
            labState.lastPinchDist = null;
            labState.isPinching = false;
        }
        updateLabTransform();
        return; // Skip the rest of the render loop
    }

    canvasElement.width = window.innerWidth;
    canvasElement.height = window.innerHeight;
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw PIP video feed
    const pipWidth = canvasElement.width * 0.25;
    const pipHeight = pipWidth * (9/16);
    canvasCtx.drawImage(results.image, 0, 0, pipWidth, pipHeight);

    // Reset hover styles
    const domBoxes = optionsContainerElement.children;
    for (let box of domBoxes) box.classList.remove('hover');

    let handOverOption = false;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusElement.innerText = "Hold an Open Palm over your answer";
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

            const gesture = detectGesture(landmarks);
            if (gesture === 'Open Palm') {
                // Use palm center (landmark 9) for collision, but flip X coord due to mirroring
                const handX = (1 - landmarks[9].x) * canvasElement.width;
                const handY = landmarks[9].y * canvasElement.height;
                currentPalmPosition = { x: handX, y: handY };

                for (let i = 0; i < domBoxes.length; i++) {
                    const box = domBoxes[i].getBoundingClientRect();
                    if (handX > box.left && handX < box.right && handY > box.top && handY < box.bottom) {
                        handOverOption = true;
                        if (domBoxes[i]) domBoxes[i].classList.add('hover');
                        if (selectionTimeout === null) {
                            statusElement.innerText = "Selecting...";
                            selectionTimeout = setTimeout(() => checkAnswer(i), 1500);
                        }
                        break;
                    }
                }
            }
        }
    } else {
        statusElement.innerText = "Show your hand to the camera";
    }

    if (!handOverOption && selectionTimeout) {
        clearTimeout(selectionTimeout);
        selectionTimeout = null;
    }

    effects.splash(canvasCtx, canvasElement.width, canvasElement.height);

    canvasCtx.restore();
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

updateTriviaUI();
camera.start();

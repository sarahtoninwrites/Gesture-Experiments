const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const spellNameElement = document.getElementById('spell-name');
const instructionElement = document.getElementById('instruction');
const assistantResponseElement = document.getElementById('assistant-response');
const feedbackElement = document.getElementById('feedback');
const gameHudElement = document.getElementById('game-hud');
const discoveriesElement = document.getElementById('discoveries');
const voiceCommandBtn = document.getElementById('voice-command-btn');

// State management
let particles = [];
let currentLessonIndex = 0;
let spellCooldown = false;
let initialHandDetected = false;

// Game State
let gameActive = false;
let interactables = [];
let discoveries = 0;

const lessons = [
    { 
        id: "lumos",
        title: "Search", 
        instruction: "Show an Open Palm to reveal hidden secrets.", 
        gesture: "Open Palm",
        color: "255, 255, 255" 
    },
    { 
        id: "incendio",
        title: "Destroy", 
        instruction: "Clench a Closed Fist to destroy obstacles.", 
        gesture: "Closed Fist",
        color: "255, 69, 0"
    },
    { 
        id: "fulgura",
        title: "Summon", 
        instruction: "Point your Index Finger to summon power.", 
        gesture: "Index Finger",
        color: "255, 215, 0"
    },
    { 
        id: "celebratio",
        title: "Celebratio", 
        instruction: "Flash a Victory sign to celebrate!", 
        gesture: "Victory"
    }
];

// --- VOICE COMMANDS ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    voiceCommandBtn.onclick = () => {
        if (voiceCommandBtn.classList.contains('listening')) {
            recognition.stop();
        } else {
            try {
                recognition.start();
            } catch (e) {
                console.warn("Recognition start error:", e);
            }
        }
    };

    recognition.onstart = () => {
        voiceCommandBtn.classList.add('listening');
        voiceCommandBtn.innerText = "Listening...";
        assistantResponseElement.innerText = "...";
    };

    recognition.onend = () => {
        voiceCommandBtn.classList.remove('listening');
        voiceCommandBtn.innerText = "Voice Commands";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        
        let responseText = "";

        if (transcript.includes('hello') || transcript.includes('hi')) {
            responseText = "Greetings. Try not to smudge the screen with those hands.";
        } else if (transcript.includes('help')) {
            responseText = "Open Palm: Search. Fist: Destroy. It's not rocket science.";
        } else if (transcript.includes('magic')) {
            responseText = "It's mostly math, but sure, let's call it magic.";
        } else if (transcript.includes('who are you')) {
            responseText = "I'm the code running this show. Be nice.";
        } else if (transcript.includes('spell') || transcript.includes('cast')) {
            responseText = "You have the hands for it. Just focus.";
        } else if (transcript.includes('yes') || transcript.includes('no')) {
            responseText = "Binary choices are so limiting.";
        } else if (transcript.includes('why')) {
            responseText = "The universe rarely explains itself.";
        } else if (transcript.includes('time')) {
            responseText = "Time is an illusion, especially in here.";
        } else if (transcript.includes('thank')) {
            responseText = "You're welcome, mortal.";
        } else {
            const snarkyDefaults = [
                "I have no idea what that means, but it sounded profound.",
                "The aether is confused by your request.",
                "Try saying 'Help'. I'm not a mind reader.",
                "Interesting noise. Do it again?",
                "The stars are silent on that matter.",
                "Perhaps. Or perhaps not.",
                "Your voice ripples through the void.",
                "I am listening, but I am not obeying.",
                "Interesting perspective.",
                "I'll pretend I understood that."
            ];
            responseText = snarkyDefaults[Math.floor(Math.random() * snarkyDefaults.length)];
        }

        assistantResponseElement.innerText = responseText;
    };
    
    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        voiceCommandBtn.classList.remove('listening');
        voiceCommandBtn.innerText = "Voice Commands";
        
        if (event.error === 'network') {
            assistantResponseElement.innerText = "Network error: Online access required.";
        } else if (event.error === 'not-allowed') {
            assistantResponseElement.innerText = "Microphone permission denied.";
        }
    };
} else {
    voiceCommandBtn.style.display = 'none';
    console.warn("Web Speech API not supported.");
}

// --- 1. EFFECT SYSTEM ---

class Interactable {
    constructor(w, h) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.z = Math.random() * 1000; // Depth
        this.size = Math.random() * 20 + 30;
        // Types correspond to spells: rune->Search, torch->Destroy, crystal->Summon, seed->Celebratio
        const types = ['rune', 'torch', 'crystal', 'seed'];
        this.type = types[Math.floor(Math.random() * types.length)];
        this.active = false;
        this.driftX = (Math.random() - 0.5) * 0.2; // Slower drift
        this.driftY = (Math.random() - 0.5) * 0.2;
        
        // Initial visual state
        this.alpha = this.type === 'rune' ? 0 : 0.6; // Runes are invisible initially
        this.color = '#555';
    }

    update(w, h, speedX, speedZ, rightHandX, rightHandY, isLumosActive) {
        // Z movement (Zoom)
        this.z -= speedZ;
        if (this.z < 0) {
            this.z = 1000;
            this.x = Math.random() * w;
            this.y = Math.random() * h;
        }
        if (this.z > 1000) {
            this.z = 0;
            this.x = Math.random() * w;
            this.y = Math.random() * h;
        }

        const scale = Math.max(0.1, (1000 - this.z) / 1000);

        // X movement (Pan) - Move objects opposite to camera
        this.x += speedX * scale; 
        
        // Drift
        this.x += this.driftX;
        this.y += this.driftY;

        // Wrap around screen
        if (this.x < -50) this.x = w + 50;
        if (this.x > w + 50) this.x = -50;
        if (this.y < -50) this.y = h + 50;
        if (this.y > h + 50) this.y = -50;

        // Search Mechanic: Reveal Runes with Light
        if (this.type === 'rune' && !this.active) {
            this.alpha = 0;
            if (isLumosActive && rightHandX !== null) {
                const dist = Math.hypot(this.x - rightHandX, this.y - rightHandY);
                const revealRadius = 250 * scale; // Radius scales with depth
                
                if (dist < revealRadius) {
                    // Fade in based on distance
                    this.alpha = Math.min(1, (1 - dist / revealRadius) + 0.1);
                }
            }
        }
    }

    activate() {
        if (this.active) return;
        this.active = true;
        this.alpha = 1;
        discoveries++;
        discoveriesElement.innerText = "Discoveries: " + discoveries;
    }

    draw(ctx) {
        const scale = Math.max(0.1, (1000 - this.z) / 1000); // Scale based on depth, with a minimum size
        
        ctx.save();
        ctx.globalAlpha = this.active ? 1 : this.alpha * scale;
        
        ctx.beginPath();
        if (this.type === 'rune') {
            ctx.fillStyle = this.active ? '#fff' : '#444';
            ctx.font = `${40 * scale}px serif`;
            ctx.fillText("ᚣ", this.x, this.y);
        } else if (this.type === 'torch') {
            ctx.fillStyle = this.active ? '#e67e22' : '#5d4037';
            ctx.arc(this.x, this.y, 15 * scale, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'crystal') {
            ctx.fillStyle = this.active ? '#00ffff' : '#2c3e50';
            const size = 20 * scale;
            ctx.moveTo(this.x, this.y - size);
            ctx.lineTo(this.x + size * 0.75, this.y);
            ctx.lineTo(this.x, this.y + size);
            ctx.lineTo(this.x - size * 0.75, this.y);
            ctx.fill();
        } else if (this.type === 'seed') {
            ctx.fillStyle = this.active ? '#e91e63' : '#2ecc71';
            ctx.arc(this.x, this.y, (this.active ? 25 : 10) * scale, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        this.life = 1.0;
        
        if (type === 'lumos') {
            this.vx = 0;
            this.vy = 0;
            this.size = Math.random() * 100 + 200; 
            this.life = 0.5; // Smoother stream
        } else if (type === 'incendio') {
            this.vx = (Math.random() - 0.5) * 8;
            this.vy = -Math.random() * 8 - 8; // Upwards
            this.size = Math.random() * 50 + 40;
        } else if (type === 'fulgura') {
            // Lightning bolts path relative to origin
            this.path = [{x: 0, y: 0}]; 
            let cx = 0, cy = 0;
            for(let i=0; i<4; i++) {
                cx += (Math.random() - 0.5) * 500;
                cy += (Math.random() - 0.5) * 500;
                this.path.push({x: cx, y: cy});
            }
            this.life = 0.4;
        } else if (type === 'celebratio') {
            this.vx = (Math.random() - 0.5) * 15;
            this.vy = (Math.random() - 0.5) * 15;
            this.size = Math.random() * 20 + 15;
            this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            this.gravity = 0.8;
        }
    }
    update() {
        if (this.type === 'lumos') {
            this.life -= 0.02;
        } else if (this.type === 'incendio') {
            this.x += this.vx;
            this.y += this.vy;
            this.size *= 0.92;
            this.life -= 0.03;
        } else if (this.type === 'fulgura') {
            this.life -= 0.1;
        } else if (this.type === 'celebratio') {
            this.x += this.vx;
            this.y += this.vy;
            this.vy += this.gravity;
            this.life -= 0.01;
        }
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);

        if (this.type === 'lumos') {
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.globalCompositeOperation = 'screen';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'incendio') {
            ctx.fillStyle = `rgba(255, ${Math.floor(this.life * 200)}, 0, ${this.life})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'fulgura') {
            // Outer Glow
            ctx.strokeStyle = `rgba(175, 238, 238, ${this.life * 0.5})`;
            ctx.lineWidth = 20;
            ctx.shadowBlur = 70;
            ctx.shadowColor = '#00ffff';
            ctx.beginPath();
            ctx.moveTo(this.x + this.path[0].x, this.y + this.path[0].y);
            for(let i=1; i<this.path.length; i++) {
                ctx.lineTo(this.x + this.path[i].x, this.y + this.path[i].y);
            }
            ctx.stroke();

            // Inner Core
            ctx.strokeStyle = `rgba(255, 255, 255, ${this.life})`;
            ctx.lineWidth = 8;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fff';
            ctx.stroke(); // Redraw the same path with different styles
        } else if (this.type === 'celebratio') {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x, this.y, this.size, this.size);
        }

        ctx.restore();
    }
}

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

    let fingersUpCount = 0;
    if (indexUp) fingersUpCount++;
    if (middleUp) fingersUpCount++;
    if (ringUp) fingersUpCount++;
    if (pinkyUp) fingersUpCount++;

    if (fingersUpCount >= 4) return "Open Palm";
    if (fingersUpCount === 0) return "Closed Fist";
    if (indexUp && middleUp && !ringUp && !pinkyUp) return "Victory";
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return "Index Finger";
    
    return "Unknown";
}

// --- 3. MEDIAPIPE SETUP ---

function updateLessonUI() {
    if (currentLessonIndex >= lessons.length) {
        spellNameElement.innerText = "The Ethereal Void";
        instructionElement.innerText = "Left Hand: Navigate | Right Hand: Cast Spells";
        statusElement.innerText = "Explore the void.";
        gameActive = true;
        gameHudElement.style.display = 'block';
    } else {
        const lesson = lessons[currentLessonIndex];
        spellNameElement.innerText = lesson.title;
        instructionElement.innerText = lesson.instruction;
    }
}

function triggerSpellEffect(x, y, type) {
    let count = 3;
    if (type === 'incendio') count = 15;
    if (type === 'fulgura') count = 3;
    if (type === 'celebratio') count = 50;

    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, type));
    }
}

function updateExploration(canvasWidth, canvasHeight, leftHand, rightHand) {
    if (!gameActive) return;

    // Calculate Navigation (Left Hand)
    let speedX = 0;
    let speedZ = 0;
    if (leftHand) {
        const palm = leftHand[9];
        // X: Pan based on horizontal position (0.5 is center)
        speedX = (palm.x - 0.5) * 40;
        // Y: Zoom based on vertical position (Up = Zoom In)
        speedZ = (0.5 - palm.y) * 40;
    }

    // Calculate Interaction (Right Hand)
    let rightHandX = null;
    let rightHandY = null;
    let isLumosActive = false;
    
    if (rightHand) {
        rightHandX = rightHand[9].x * canvasWidth;
        rightHandY = rightHand[9].y * canvasHeight;
        const gesture = detectGesture(rightHand);
        isLumosActive = (gesture === 'Open Palm');
    }

    // Initial Spawn
    if (interactables.length < 40) { // More objects for a denser scene
        interactables.push(new Interactable(canvasWidth, canvasHeight));
    }

    interactables.forEach(obj => obj.update(canvasWidth, canvasHeight, speedX, speedZ, rightHandX, rightHandY, isLumosActive));
    
    // Sort by depth so we draw far objects first
    interactables.sort((a, b) => a.z - b.z);
}

function onResults(results) {
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw background (hide video feed)
    canvasCtx.fillStyle = '#1e1e1e';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    let leftHand = null;
    let rightHand = null;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            const label = results.multiHandedness[index].label;
            if (label === 'Right') leftHand = landmarks;
            if (label === 'Left') rightHand = landmarks;
        }
    }

    // Draw Game Elements
    if (gameActive) {
        updateExploration(canvasElement.width, canvasElement.height, leftHand, rightHand);
        interactables.forEach(obj => obj.draw(canvasCtx));
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        // Hide status message after first detection to prevent UI overlap
        if (!initialHandDetected) {
            statusElement.style.display = 'none';
            initialHandDetected = true;
        }

        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 5});
            drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

            const gesture = detectGesture(landmarks);
            
            // --- Learning Phase ---
            if (currentLessonIndex < lessons.length) {
                const lesson = lessons[currentLessonIndex];
                if (gesture === lesson.gesture) {
                    // Trigger Effect
                    const x = landmarks[9].x * canvasElement.width;
                    const y = landmarks[9].y * canvasElement.height;
                    triggerSpellEffect(x, y, lesson.id);

                    if (!spellCooldown) {
                        spellCooldown = true;
                        feedbackElement.innerText = "Spell Cast!";
                        feedbackElement.style.opacity = 1;
                        spellNameElement.parentElement.style.display = 'none';
                        
                        setTimeout(() => {
                            currentLessonIndex++;
                            updateLessonUI();
                            spellCooldown = false;
                            feedbackElement.style.opacity = 0;
                            spellNameElement.parentElement.style.display = 'block';
                        }, 2000);
                    }
                }
            } else {
                // --- Free Play Mode ---
                // Only allow Right Hand to cast spells in Free Play
                if (landmarks === rightHand) {
                for (const spell of lessons) {
                    if (gesture === spell.gesture) {
                        const currentHandX = landmarks[9].x * canvasElement.width;
                        const currentHandY = landmarks[9].y * canvasElement.height;

                        // Interaction Logic
                        interactables.forEach(obj => {
                            if (obj.active) return; // Already active
                            
                            const scale = Math.max(0.1, (1000 - obj.z) / 1000);
                            const interactionRadius = 100 * scale; // Interaction radius scales with object size
                            const dist = Math.hypot(obj.x - currentHandX, obj.y - currentHandY);

                            if (dist < interactionRadius) {
                                // Check if spell matches object type
                                if ((spell.id === 'lumos' && obj.type === 'rune') ||
                                    (spell.id === 'incendio' && obj.type === 'torch') ||
                                    (spell.id === 'fulgura' && obj.type === 'crystal') ||
                                    (spell.id === 'celebratio' && obj.type === 'seed')) {
                                    
                                    obj.activate();
                                    triggerSpellEffect(obj.x, obj.y, spell.id);
                                }
                            }
                        });
                        
                        // Visual effect for casting
                        triggerSpellEffect(currentHandX, currentHandY, spell.id);
                        break; 
                    }
                }
                }
            }
        }
    } else {
        // If hand is lost after initial detection, show a prompt
        if (initialHandDetected) {
            statusElement.style.display = 'block';
            statusElement.innerText = "Show your hand to the camera";
        }
    }

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw(canvasCtx);
    }
    // Remove dead particles
    particles = particles.filter(p => p.life > 0);

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

updateLessonUI();
camera.start();

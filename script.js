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
let initialHandDetected = false;

let currentRightHandGesture = null;
let currentRightHandPos = null;
let activeSpellId = null;

// Game State
let gameActive = false;
let interactables = [];
let discoveries = 0;

const lessons = [
    { 
        id: "lumos",
        title: "Search", 
        instruction: "Hold Open Palm and say 'Lumos'.", 
        gesture: "Open Palm",
        color: "255, 255, 255" 
    },
    { 
        id: "inferno",
        title: "Destroy", 
        instruction: "Hold Fist and say 'Inferno'.", 
        gesture: "Closed Fist",
        color: "255, 69, 0"
    },
    { 
        id: "bolto",
        title: "Summon", 
        instruction: "Point Finger and say 'Bolto'.", 
        gesture: "Index Finger",
        color: "255, 215, 0"
    }
];

// --- VOICE COMMANDS ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // Listen throughout
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    voiceCommandBtn.onclick = () => {
        try {
            recognition.start();
            voiceCommandBtn.innerText = "Listening...";
            voiceCommandBtn.classList.add('listening');
        } catch (e) {
            console.warn("Recognition already active");
        }
    };

    recognition.onresult = (event) => {
        // Get the latest result
        const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
        console.log("Heard:", transcript);
        checkCombo(transcript);

        // Conversational Logic
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
             const isSpell = transcript.includes('lumos') || transcript.includes('light') || transcript.includes('search') ||
                            transcript.includes('inferno') || transcript.includes('fire') || transcript.includes('burn') ||
                            transcript.includes('bolto') || transcript.includes('bolt') || transcript.includes('spark');
            
            if (!isSpell) {
                const snarkyDefaults = [
                    "I have no idea what that means, but it sounded profound.",
                    "The aether is confused by your request.",
                    "Try saying 'Help'. I'm not a mind reader.",
                    "Interesting noise. Do it again?",
                    "The stars are silent on that matter.",
                    "Perhaps. Or perhaps not.",
                    "Your voice ripples through the void."
                ];
                responseText = snarkyDefaults[Math.floor(Math.random() * snarkyDefaults.length)];
            }
        }

        if (responseText && assistantResponseElement) {
            assistantResponseElement.innerText = responseText;
            setTimeout(() => { if(assistantResponseElement.innerText === responseText) assistantResponseElement.innerText = ""; }, 5000);
        }
    };

    recognition.onend = () => {
        // Auto-restart to "listen throughout" if the game is still running
        if (voiceCommandBtn.classList.contains('listening')) {
            try { recognition.start(); } catch (e) {}
        }
    };
    
    recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        // Stop the loop on fatal errors
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
             voiceCommandBtn.classList.remove('listening');
             voiceCommandBtn.innerText = "Enable Voice Magic";
        }
    };
} else {
    voiceCommandBtn.style.display = 'none';
    console.warn("Web Speech API not supported.");
}

function checkCombo(voiceCommand) {
    if (!currentRightHandGesture) return;

    // Map voice commands to spell IDs
    let spellId = null;
    if (voiceCommand.includes('lumos') || voiceCommand.includes('light') || voiceCommand.includes('search')) spellId = 'lumos';
    else if (voiceCommand.includes('inferno') || voiceCommand.includes('fire') || voiceCommand.includes('burn')) spellId = 'inferno';
    else if (voiceCommand.includes('bolto') || voiceCommand.includes('bolt') || voiceCommand.includes('spark')) spellId = 'bolto';

    if (spellId) {
        // Find the required gesture for this spell
        const lesson = lessons.find(l => l.id === spellId);
        
        // CHECK COMBO: Voice matches Spell AND Gesture matches Spell
        if (lesson && currentRightHandGesture === lesson.gesture) {
            castSpell(spellId);
        } else {
            feedbackElement.innerText = "Wrong move buddy";
            feedbackElement.style.opacity = 1;
            setTimeout(() => feedbackElement.style.opacity = 0, 1000);
        }
    }
}

function castSpell(spellId) {
    activeSpellId = spellId;
    // Logic: Learning Phase
    if (currentLessonIndex < lessons.length) {
        if (lessons[currentLessonIndex].id === spellId) {
            feedbackElement.innerText = "Perfect Combo!";
            feedbackElement.style.opacity = 1;
            spellNameElement.parentElement.style.display = 'none';
            
            // Lesson advancement is now handled when the gesture is released.
        }
    } 
    // Logic: Free Play
    else if (gameActive) {
        // Interact with objects
        interactables.forEach(obj => {
            if (obj.active) return;
            
            // Distance check using the cached hand position
            const scale = Math.max(0.1, (1000 - obj.z) / 1000);
            const interactionRadius = 150 * scale; 
            const dist = Math.hypot(obj.x - currentRightHandPos.x, obj.y - currentRightHandPos.y);

            if (dist < interactionRadius) {
                if ((spellId === 'inferno' && obj.type === 'torch') ||
                    (spellId === 'bolto' && obj.type === 'crystal')) {
                    
                    obj.activate();
                    // Extra effect on the object
                    triggerSpellEffect(obj.x, obj.y, spellId);
                }
            }
        });
    }
}

// --- 1. EFFECT SYSTEM ---

class Interactable {
    constructor(w, h) {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.z = Math.random() * 1000; // Depth
        this.size = Math.random() * 20 + 30;
        // Types correspond to spells: rune->Search, torch->Destroy, crystal->Summon
        const types = ['rune', 'torch', 'crystal'];
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
        } else if (type === 'inferno') {
            this.vx = (Math.random() - 0.5) * 8;
            this.vy = -Math.random() * 8 - 8; // Upwards
            this.size = Math.random() * 50 + 40;
        } else if (type === 'bolto') {
            // Lightning bolts path relative to origin
            this.path = [{x: 0, y: 0}]; 
            let cx = 0, cy = 0;
            for(let i=0; i<4; i++) {
                cx += (Math.random() - 0.5) * 500;
                cy += (Math.random() - 0.5) * 500;
                this.path.push({x: cx, y: cy});
            }
            this.life = 0.4;
        }
    }
    update() {
        if (this.type === 'lumos') {
            this.life -= 0.02;
        } else if (this.type === 'inferno') {
            this.x += this.vx;
            this.y += this.vy;
            this.size *= 0.92;
            this.life -= 0.03;
        } else if (this.type === 'bolto') {
            this.life -= 0.1;
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
        } else if (this.type === 'inferno') {
            ctx.fillStyle = `rgba(255, ${Math.floor(this.life * 200)}, 0, ${this.life})`;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'bolto') {
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
    if (indexUp && !middleUp && !ringUp && !pinkyUp) return "Index Finger";
    
    return "Unknown";
}

// --- 3. MEDIAPIPE SETUP ---

function updateLessonUI() {
    if (currentLessonIndex >= lessons.length) {
        spellNameElement.innerText = "The Ethereal Void";
        instructionElement.innerText = "Navigate (Left) | Combo: Gesture + Voice (Right)";
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
    if (type === 'inferno') count = 15;
    if (type === 'bolto') count = 3;

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
    const isLumosActive = (activeSpellId === 'lumos');
    
    if (rightHand) {
        rightHandX = rightHand[9].x * canvasWidth;
        rightHandY = rightHand[9].y * canvasHeight;
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
    
    // Reset per frame
    currentRightHandGesture = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const [index, landmarks] of results.multiHandLandmarks.entries()) {
            const label = results.multiHandedness[index].label;
            if (label === 'Right') leftHand = landmarks;
            if (label === 'Left') rightHand = landmarks;
        }
    }

    // Draw Game Elements
    if (gameActive) {
        updateExploration(canvasElement.width, canvasElement.height, leftHand, rightHand, activeSpellId);
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

            // Update Global State for Combo System
            if (landmarks === rightHand || (results.multiHandLandmarks.length === 1)) {
                // If only one hand, assume it's the casting hand for simplicity in learning mode
                currentRightHandGesture = detectGesture(landmarks);
                currentRightHandPos = {
                    x: landmarks[9].x * canvasElement.width,
                    y: landmarks[9].y * canvasElement.height
                };
            }
        }
    }

    // --- NEW SPELL HOLDING LOGIC ---
    if (activeSpellId) {
        const spell = lessons.find(l => l.id === activeSpellId);
        // Check if we are still holding the correct gesture
        if (spell && currentRightHandGesture === spell.gesture) {
            // Spell is active, keep casting the effect
            if (currentRightHandPos) {
                triggerSpellEffect(currentRightHandPos.x, currentRightHandPos.y, activeSpellId);
            }
        } else {
            // Gesture has changed or hand is lost, release the spell.
            
            // If we were learning this spell, advance to the next lesson.
            if (currentLessonIndex < lessons.length && lessons[currentLessonIndex].id === activeSpellId) {
                currentLessonIndex++;
                updateLessonUI();
            }

            activeSpellId = null; // Stop the spell
            feedbackElement.style.opacity = 0; // Hide feedback
            spellNameElement.parentElement.style.display = 'block';
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

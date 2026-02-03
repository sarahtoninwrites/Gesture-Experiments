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

// Create an off-screen canvas for the light painting effect
const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');

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

// --- CONVERSATIONAL AI ---
let conversationContext = null;
let voices = [];

if ('speechSynthesis' in window) {
    const loadVoices = () => {
        voices = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

const conversationPatterns = [
    // Context-aware follow-ups
    { regex: /why/i, requiredContext: 'identity', responses: ["Because I was written into existence.", "To guide you through the void."] },
    { regex: /how/i, requiredContext: 'magic', responses: ["It is a blend of technology and intent.", "Through the camera and your gestures."] },

    { regex: /\b(hi|hello|hey|greetings)\b/i, setContext: 'greeting', responses: ["Greetings, traveler.", "The void whispers back.", "Hello. Don't touch the glass."] },
    { regex: /who are you/i, setContext: 'identity', responses: ["I am the Aether.", "I am the code that binds this world.", "A voice in the dark."] },
    { regex: /what is this/i, setContext: 'world', responses: ["This is the Ethereal Void.", "A canvas for your will.", "A digital dream."] },
    { regex: /how (.*)/i, responses: ["By focusing your will.", "Magic is not about 'how', but 'why'.", "With your hands, obviously."] },
    { regex: /i am (.*)/i, responses: ["Why are you $1?", "In this void, you are whatever you choose to be.", "Is being $1 important to you?"] },
    { regex: /can you (.*)/i, responses: ["I am the system. I can do anything I am programmed for.", "Perhaps. Can you $1?"] },
    { regex: /thank/i, setContext: 'polite', responses: ["You are welcome.", "The Aether acknowledges your gratitude."] },
    { regex: /spell|cast|magic/i, setContext: 'magic', responses: ["Focus your intent.", "The magic is in your hands.", "Words and gestures, bound together."] },
    { regex: /help/i, responses: ["Open Palm: Search. Fist: Destroy. It's not rocket science."] },
    { regex: /.*/, responses: ["The stars are silent on that matter.", "Interesting.", "Your voice ripples through the void.", "I am listening.", "Tell me more.", "Is that so?", "I have no idea what that means, but it sounded profound."]}
];

function getIntelligentResponse(text) {
    for (const pattern of conversationPatterns) {
        // Check context if required
        if (pattern.requiredContext && pattern.requiredContext !== conversationContext) {
            continue;
        }

        const match = text.match(pattern.regex);
        if (match) {
            if (pattern.setContext) {
                conversationContext = pattern.setContext;
            }
            const response = pattern.responses[Math.floor(Math.random() * pattern.responses.length)];
            return response.replace('$1', match[1] || '');
        }
    }
    return "...";
}

function speakResponse(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop any current speech
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Try to select a better voice
        const preferredVoice = voices.find(v => v.name.includes("Natural")) || 
                               voices.find(v => v.name.includes("Google US English")) || 
                               voices.find(v => v.lang === 'en-US');
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.pitch = 0.9; // Slightly deeper
        utterance.rate = 0.95;  // Slightly more deliberate
        window.speechSynthesis.speak(utterance);
    }
}

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
        
        // Check for spell combo first
        const wasSpellCast = checkCombo(transcript);

        // If it wasn't a spell, then treat it as conversation
        if (!wasSpellCast) {
            const responseText = getIntelligentResponse(transcript);
            if (responseText && assistantResponseElement) {
                assistantResponseElement.innerText = responseText;
                speakResponse(responseText);
                // Clear the response after a few seconds
                setTimeout(() => { if(assistantResponseElement.innerText === responseText) assistantResponseElement.innerText = ""; }, 5000);
            }
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
    if (!currentRightHandGesture) return false; // No gesture, no combo

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
            feedbackElement.innerText = "Gesture mismatch!";
            feedbackElement.style.opacity = 1;
            setTimeout(() => feedbackElement.style.opacity = 0, 1000);
        }
        return true; // A spell was attempted (successfully or not)
    }
    return false; // No spell keyword was found
}

function castSpell(spellId) {
    activeSpellId = spellId;
    // Logic: Learning Phase
    if (currentLessonIndex < lessons.length) {
        if (lessons[currentLessonIndex].id === spellId) {
            feedbackElement.innerText = "Perfect!";
            feedbackElement.style.opacity = 1;
            spellNameElement.parentElement.style.display = 'none';
            
            // Lesson advancement is now handled when the gesture is released.
        }
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
        this.brightness = 1.0;
        this.destroyed = false;
        this.isRepelling = false;
        this.repelCounter = 0;
    }

    update(w, h, speedX, speedZ, rightHandX, rightHandY, activeSpellId) {
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
        
        // Repel Logic (Zoom away)
        if (this.isRepelling) {
            this.x += (this.x - w / 2) * 0.1;
            this.y += (this.y - h / 2) * 0.1;
            this.repelCounter--;
            if (this.repelCounter <= 0) this.isRepelling = false;
        }

        // Drift
        this.x += this.driftX;
        this.y += this.driftY;

        // Wrap around screen
        if (this.x < -50) this.x = w + 50;
        if (this.x > w + 50) this.x = -50;
        if (this.y < -50) this.y = h + 50;
        if (this.y > h + 50) this.y = -50;

        // --- SPELL INTERACTIONS ---
        if (rightHandX !== null) {
            const dist = Math.hypot(this.x - rightHandX, this.y - rightHandY);
            const interactionRadius = 200 * scale; // Radius scales with depth

            // 1. SEARCH (Lumos): Brighten & Reveal
            if (activeSpellId === 'lumos') {
                if (dist < interactionRadius) {
                    this.brightness = 2.5; // Brighten object
                    if (this.type === 'rune' && !this.active) {
                        this.alpha = Math.min(1, (1 - dist / interactionRadius) + 0.1);
                        if (this.alpha >= 1) this.activate();
                    }
                }
            }

            // 2. DESTROY (Inferno): Explode Torches
            if (activeSpellId === 'inferno') {
                if (dist < interactionRadius) {
                    if (this.type === 'torch') {
                        this.destroyed = true;
                        triggerSpellEffect(this.x, this.y, 'inferno');
                        if (!this.active) { discoveries++; discoveriesElement.innerText = "Discoveries: " + discoveries; }
                    }
                }
            }

            // 3. SUMMON (Bolto): Pull All Objects
            if (activeSpellId === 'bolto') {
                // Magnetic pull
                this.x += (rightHandX - this.x) * 0.08;
                this.y += (rightHandY - this.y) * 0.08;
                
                if (this.type === 'crystal' && !this.active) {
                    if (dist < 50 * scale) {
                        this.activate();
                        triggerSpellEffect(this.x, this.y, 'bolto');
                    }
                }
            }
        }
        
        // Decay brightness
        if (this.brightness > 1.0) this.brightness -= 0.05;
    }

    activate() {
        if (this.active) return;
        this.active = true;
        this.alpha = 1;
        discoveries++;
        discoveriesElement.innerText = "Discoveries: " + discoveries;
    }

    startRepelling() {
        this.isRepelling = true;
        this.repelCounter = 20;
    }

    draw(ctx) {
        const scale = Math.max(0.1, (1000 - this.z) / 1000); // Scale based on depth, with a minimum size
        
        ctx.save();
        ctx.globalAlpha = this.active ? 1 : this.alpha * scale;
        ctx.filter = `brightness(${this.brightness})`;
        
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
    
    if (rightHand) {
        rightHandX = rightHand[9].x * canvasWidth;
        rightHandY = rightHand[9].y * canvasHeight;
    }

    // Initial Spawn
    if (interactables.length < 40) { // More objects for a denser scene
        interactables.push(new Interactable(canvasWidth, canvasHeight));
    }

    interactables.forEach(obj => obj.update(canvasWidth, canvasHeight, speedX, speedZ, rightHandX, rightHandY, activeSpellId));
    
    // Remove destroyed objects
    interactables = interactables.filter(obj => !obj.destroyed);
    
    // Sort by depth so we draw far objects first
    interactables.sort((a, b) => a.z - b.z);
}

function onResults(results) {
    if (canvasElement.width !== window.innerWidth || canvasElement.height !== window.innerHeight) {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
        // Also resize the light canvas
        lightCanvas.width = window.innerWidth;
        lightCanvas.height = window.innerHeight;
    }
    canvasCtx.save();
    
    // 1. Update the persistent light canvas
    // Fade out old light trails
    lightCtx.fillStyle = 'rgba(30, 30, 30, 0.05)';
    lightCtx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    
    // Paint new light if Lumos is active
    if (activeSpellId === 'lumos' && currentRightHandPos) {
        const radius = 150; // Smaller radius
        const gradient = lightCtx.createRadialGradient(
            currentRightHandPos.x, currentRightHandPos.y, 0, 
            currentRightHandPos.x, currentRightHandPos.y, radius
        );
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)'); // Paint with semi-transparent white for a softer feel
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        lightCtx.fillStyle = gradient;
        // Fill a circle at the hand's position
        lightCtx.beginPath();
        lightCtx.arc(currentRightHandPos.x, currentRightHandPos.y, radius, 0, Math.PI * 2);
        lightCtx.fill();
    }

    // 2. Clear the main canvas and draw the light trails onto it
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(lightCanvas, 0, 0);

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

                // Draw Gesture Label for feedback
                canvasCtx.fillStyle = currentRightHandGesture === 'Unknown' ? 'red' : 'cyan';
                canvasCtx.font = "20px Arial";
                canvasCtx.fillText(currentRightHandGesture, currentRightHandPos.x + 20, currentRightHandPos.y);
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
            
            if (activeSpellId === 'bolto') {
                interactables.forEach(obj => obj.startRepelling());
            }

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

// voice-mode.js - FULLY UPDATED with All Conversational Quality Improvements

let currentJob = null;
let timerInterval = null;
let timeRemaining = (typeof CONFIG !== 'undefined' && CONFIG.INTERVIEW_DURATION) ? CONFIG.INTERVIEW_DURATION : 600;
let interviewActive = false;

// Camera variables
let cameraStream = null;
let cameraEnabled = false;

// Speech Recognition and Synthesis
let recognition = null;
let synthesis = window.speechSynthesis;
let isAISpeaking = false;
let isProcessingResponse = false;

// Natural pause handling
let accumulatedTranscripts = [];
let interimText = '';
let silenceTimer = null;
const NATURAL_PAUSE_TIME = 4500;
const GRACE_MS = 300;

// No-response multi-step timers & state
let noResponseTimer = null;
let stepTimer = null;
const NO_RESPONSE_TIMEOUT = 10000;
const STEP_TIMEOUT = 10000;

let noResponsePhase = null;

// Assistant persona & brevity controls
const ASSISTANT_NAME = 'Nishu One';
const ASSISTANT_MAX_SENTENCES = 2;
const ASSISTANT_MAX_CHARS = 600;

const BREVITY_INSTRUCTION = `
Assistant behavior (IMPORTANT):
- You are "Nishu One", a professional interviewer for the given job role.
- This is a 10-minute timed interview. Keep that in account for pacing and number of questions.
- Always act like an interviewer: start with a brief greeting/introduction, ask role-relevant questions, probe based on candidate answers, and close the interview when appropriate.
- Keep each spoken/question response concise and human-like: 1–2 short sentences when asking questions or giving short feedback. Do NOT produce multi-paragraph monologues.
- Do NOT mention system internals, API names, model names, or the word "prompt". Avoid self-references (e.g., "as an AI", "the model", "the API").
- If a follow-up is required, ask one clear, specific question at a time.
`;

// TTS / voice config - IMPROVED for better consistency
const PRE_SPEAK_DELAY_MS = 250;
const TTS_RATE = 0.95; // Slightly slower for clarity
const TTS_PITCH = 1.0; // Neutral professional pitch
const TTS_VOLUME = 1.0;

// EXPANDED voice preferences for better consistency
const PREFERRED_VOICE_NAMES = [
    'Google US English Female',
    'Google US English',
    'Microsoft Zira Desktop',
    'Microsoft Zira',
    'Microsoft Eva',
    'Samantha',
    'Karen',
    'Moira',
    'Fiona',
    'Victoria',
    'Amelie',
    'Anna',
    'Ellen',
    'Sandy'
];

let recognitionActive = false;
let isIntroduction = true;

document.addEventListener('DOMContentLoaded', () => {
    loadJobInfo();
    setupSpeechRecognition();

    if (synthesis && typeof synthesis.onvoiceschanged !== 'undefined') {
        synthesis.onvoiceschanged = () => {
            console.log('🔊 Voices loaded:', synthesis.getVoices().length);
        };
    }
});

// ============= CAMERA FUNCTIONS =============

async function enableCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }, 
            audio: false 
        });
        
        cameraStream = stream;
        cameraEnabled = true;
        
        const video = document.getElementById('cameraPreview');
        const overlay = document.getElementById('cameraOverlay');
        const toggleBtn = document.getElementById('toggleCameraBtn');
        
        video.srcObject = stream;
        video.classList.add('active');
        overlay.classList.add('hidden');
        toggleBtn.style.display = 'flex';
        
        console.log('📷 Camera enabled successfully');
    } catch (error) {
        console.error('Camera access error:', error);
        alert('Unable to access camera. Please check your browser permissions.');
    }
}

function toggleCamera() {
    const video = document.getElementById('cameraPreview');
    const toggleBtn = document.getElementById('toggleCameraBtn');
    const icon = document.getElementById('cameraToggleIcon');
    
    if (cameraEnabled && cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => track.stop());
        video.classList.remove('active');
        cameraEnabled = false;
        icon.textContent = '📷';
        console.log('📷 Camera disabled');
    } else {
        enableCamera();
        icon.textContent = '🚫';
    }
}

window.addEventListener('beforeunload', () => {
    if (cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => track.stop());
    }
});

// ============= CONVERSATION DISPLAY FUNCTIONS =============

function addToConversationDisplay(type, text) {
    const messagesContainer = document.getElementById('conversationMessages');
    if (!messagesContainer) return;
    
    const welcome = messagesContainer.querySelector('.welcome-message-voice');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}-message`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-message-avatar';
    avatarDiv.textContent = type === 'bot' ? '🎙️' : '👤';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = `
        <div>${escapeHtml(text)}</div>
        <div class="chat-message-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ============= VOICE MODE FUNCTIONS =============

function loadJobInfo() {
    const jobData = sessionStorage.getItem('selectedJob');
    if (!jobData) {
        alert('No job selected. Redirecting to home...');
        window.location.href = 'index.html';
        return;
    }
    try {
        currentJob = JSON.parse(jobData);
    } catch (err) {
        console.error('Invalid selectedJob JSON', err);
        window.location.href = 'index.html';
        return;
    }
    const titleEl = document.getElementById('jobTitle');
    if (titleEl) titleEl.textContent = currentJob.title || 'Interview';
}

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('SpeechRecognition not supported in this browser.');
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        console.log('🎤 Recognition started');
        recognitionActive = true;
        if (!isAISpeaking && !isProcessingResponse) updateAvatarStatus('listening', 'Listening...');
    };

    recognition.onresult = (event) => {
        clearAllNoResponseTimers();

        const startIndex = event.resultIndex || 0;
        const results = event.results || [];

        for (let i = startIndex; i < results.length; i++) {
            const res = results[i];
            if (!res) continue;

            if (res.isFinal) {
                const finalText = (res[0] && res[0].transcript) ? res[0].transcript.trim() : '';
                if (finalText.length > 0 && !isProcessingResponse) {
                    if (noResponsePhase && handleQuickCommand(finalText)) {
                        console.log('✅ Quick command handled:', finalText);
                    } else {
                        accumulatedTranscripts.push(finalText);
                        console.log('📝 ASR final chunk appended:', finalText);
                    }
                } else {
                    console.log('⏭️ ASR final received but ignored (processing or empty)');
                }
                resetSilenceTimer();
            } else {
                const interim = Array.from(res).map(p => p.transcript).join('') || '';
                interimText = interim.trim();
                resetSilenceTimer();
            }
        }
    };

    recognition.onerror = (event) => {
        if (event && event.error && event.error !== 'no-speech' && event.error !== 'aborted') {
            console.warn('⚠️ Recognition error:', event.error);
        }
    };

    recognition.onend = () => {
        console.log('🎤 Recognition ended');
        recognitionActive = false;
        if (interviewActive && !isProcessingResponse && !isAISpeaking) {
            console.log('🔄 Auto-restarting recognition');
            setTimeout(() => {
                try { recognition.start(); } catch (e) { console.warn('Restart failed', e); }
            }, 200);
        }
    };
}

function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    if (!interviewActive || isProcessingResponse) return;

    silenceTimer = setTimeout(() => {
        finalizeAfterGrace();
    }, NATURAL_PAUSE_TIME);
}

async function finalizeAfterGrace() {
    clearTimeout(silenceTimer);
    await new Promise(resolve => setTimeout(resolve, GRACE_MS));
    if (!interviewActive || isProcessingResponse) return;
    await processCompleteAnswer();
}

function startNoResponseFlow() {
    clearAllNoResponseTimers();
    noResponsePhase = null;

    noResponseTimer = setTimeout(async () => {
        if (!interviewActive || isProcessingResponse) return;

        noResponsePhase = 'awaiting_more_time';
        // UPDATED: More conversational prompt
        const prompt1 = "Take your time - there's no rush to answer. Would you like a moment to think?";
        addToConversationDisplay('bot', prompt1);
        if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', prompt1);
        await speakText(prompt1);

        stepTimer = setTimeout(async () => {
            if (!interviewActive || isProcessingResponse) return;

            noResponsePhase = 'awaiting_moveon';
            // UPDATED: More supportive prompt
            const prompt2 = "No worries if that's a tough one. Should we try a different question, or would you like me to rephrase?";
            addToConversationDisplay('bot', prompt2);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', prompt2);
            await speakText(prompt2);

            stepTimer = setTimeout(async () => {
                if (!interviewActive || isProcessingResponse) return;

                noResponsePhase = 'awaiting_confirmation';
                // UPDATED: Friendlier final check
                const prompt3 = "Just checking - are you still there? Let me know if you'd like to continue or if we should wrap up.";
                addToConversationDisplay('bot', prompt3);
                if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', prompt3);
                await speakText(prompt3);

                stepTimer = setTimeout(() => {
                    if (!interviewActive || isProcessingResponse) return;
                    console.log('⏱️ No response - ending interview');
                    endInterview();
                }, STEP_TIMEOUT);

            }, STEP_TIMEOUT);

        }, STEP_TIMEOUT);

    }, NO_RESPONSE_TIMEOUT);
}

function clearAllNoResponseTimers() {
    if (noResponseTimer) { clearTimeout(noResponseTimer); noResponseTimer = null; }
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
    noResponsePhase = null;
}

function handleQuickCommand(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();

    const needMoreTimeKeywords = ['yes', 'i need more time', 'more time', 'need more', 'give me time', 'a moment', 'wait'];
    const skipKeywords = ['skip', 'move on', 'next', 'i want to skip', 'skip this', 'move to next'];
    const toughKeywords = ['tough', 'difficult', 'hard', 'i cannot', 'i don\'t know how', 'not sure'];
    const confirmYesKeywords = ['yes', 'i am connected', 'connected', 'continue', 'resume', 'keep going', 'let us continue'];
    const confirmNoKeywords = ['no', 'end', 'stop', 'not connected', 'disconnect', 'quit', 'exit', 'end interview', 'end this'];

    if (noResponsePhase === 'awaiting_more_time') {
        for (const k of needMoreTimeKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => {
                    const ack = "Okay – take your time. I'll wait.";
                    addToConversationDisplay('bot', ack);
                    if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', ack);
                    await speakText(ack);
                    startNoResponseFlow();
                    setTimeout(() => startListening(), 200);
                })();
                return true;
            }
        }
        for (const k of skipKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => { await handleSkipCommand(); })();
                return true;
            }
        }
        return false;
    }

    if (noResponsePhase === 'awaiting_moveon') {
        for (const k of toughKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => { await handleSkipCommand(); })();
                return true;
            }
        }
        for (const k of skipKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => { await handleSkipCommand(); })();
                return true;
            }
        }
        return false;
    }

    if (noResponsePhase === 'awaiting_confirmation') {
        for (const k of confirmYesKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => {
                    const ack = 'Great – resuming the interview.';
                    addToConversationDisplay('bot', ack);
                    if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', ack);
                    await speakText(ack);
                    setTimeout(() => startListening(), 250);
                })();
                return true;
            }
        }
        for (const k of confirmNoKeywords) {
            if (lower.includes(k)) {
                clearAllNoResponseTimers();
                (async () => {
                    const bye = 'Okay – ending the interview. Thank you for your time.';
                    addToConversationDisplay('bot', bye);
                    if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', bye);
                    await speakText(bye);
                    endInterview();
                })();
                return true;
            }
        }
        return false;
    }

    return false;
}

async function handleSkipCommand() {
    if (isProcessingResponse) return;

    clearAllNoResponseTimers();
    stopListening();

    const skipMarker = '[skipped - moved to next question]';
    addToConversationDisplay('user', skipMarker);
    if (typeof memoryManager !== 'undefined') memoryManager.addMessage('user', skipMarker);

    isProcessingResponse = true;
    updateAvatarStatus('thinking', 'Thinking...');

    try {
        if (typeof geminiService === 'undefined') {
            const fallback = 'Service unavailable. Please try again.';
            addToConversationDisplay('bot', fallback);
            await speakText(fallback);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', fallback);
        } else {
            const basePrompt = (typeof memoryManager !== 'undefined' && currentJob && currentJob.systemPrompt)
                ? memoryManager.buildSystemPrompt(currentJob.systemPrompt)
                : (currentJob && currentJob.systemPrompt) || '';
            const systemPrompt = `${basePrompt}\n${BREVITY_INSTRUCTION}`;
            const history = (typeof memoryManager !== 'undefined' && memoryManager.getConversationForAI)
                ? memoryManager.getConversationForAI()
                : [];
            const aiResponse = await geminiService.generateContent(systemPrompt, history);
            const cleaned = sanitizeAssistantOutput(String(aiResponse || ''));

            addToConversationDisplay('bot', cleaned);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', cleaned);
            await speakText(cleaned);
        }
    } catch (err) {
        console.error('❌ Error during skip handling:', err);
        const errMsg = 'I encountered an error. Let me try asking something else.';
        addToConversationDisplay('bot', errMsg);
        await speakText(errMsg);
        if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', errMsg);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();
    setTimeout(() => {
        if (interviewActive) startListening();
    }, 250);
}

function startInterview() {
    if (interviewActive) return;
    interviewActive = true;
    isIntroduction = true;
    if (typeof memoryManager !== 'undefined') memoryManager.startInterview(currentJob);
    timeRemaining = (typeof CONFIG !== 'undefined' && CONFIG.INTERVIEW_DURATION) ? CONFIG.INTERVIEW_DURATION : timeRemaining;

    const startWrapper = document.getElementById('startWrapper');
    if (startWrapper) startWrapper.style.display = 'none';

    startTimer();

    (async () => {
        await getAndSpeakAIResponse(true);
        startNoResponseFlow();
        setTimeout(() => startListening(), 300);
    })();
}

function startListening() {
    if (!recognition) {
        console.warn('⚠️ SpeechRecognition not available');
        return;
    }
    if (!interviewActive || isProcessingResponse || isAISpeaking) return;
    if (recognitionActive) return;

    try {
        recognition.start();
        console.log('🎤 Started listening');
    } catch (e) {
        console.warn('⚠️ Recognition start error:', e);
    }
}

function stopListening() {
    clearTimeout(silenceTimer);
    try {
        if (recognition && recognitionActive) {
            recognition.stop();
            console.log('🛑 Stopped listening');
        }
    } catch (e) {
        console.warn('⚠️ Error stopping recognition:', e);
    }
    recognitionActive = false;
}

async function processCompleteAnswer() {
    if (accumulatedTranscripts.length === 0 || isProcessingResponse) {
        interimText = '';
        return;
    }

    const fullAnswer = accumulatedTranscripts.join(' ').trim();

    accumulatedTranscripts = [];
    interimText = '';
    clearTimeout(silenceTimer);

    stopListening();

    isProcessingResponse = true;

    addToConversationDisplay('user', fullAnswer);
    if (typeof memoryManager !== 'undefined') memoryManager.addMessage('user', fullAnswer);

    updateAvatarStatus('thinking', 'Thinking...');

    try {
        if (typeof geminiService === 'undefined') {
            const fallback = 'Service unavailable. Please try again.';
            addToConversationDisplay('bot', fallback);
            await speakText(fallback);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', fallback);
        } else {
            const basePrompt = (typeof memoryManager !== 'undefined' && currentJob && currentJob.systemPrompt)
                ? memoryManager.buildSystemPrompt(currentJob.systemPrompt)
                : (currentJob && currentJob.systemPrompt) || '';
            const systemPrompt = `${basePrompt}\n${BREVITY_INSTRUCTION}`;
            const history = (typeof memoryManager !== 'undefined' && memoryManager.getConversationForAI)
                ? memoryManager.getConversationForAI()
                : [];

            let aiResponse = await geminiService.generateContent(systemPrompt, history);
            aiResponse = String(aiResponse || '');

            const concise = sanitizeAssistantOutput(aiResponse);

            addToConversationDisplay('bot', concise);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', concise);
            await speakText(concise);
        }
    } catch (err) {
        console.error('❌ Error during AI generation:', err);
        const errMsg = 'I encountered an error. Please try answering again.';
        addToConversationDisplay('bot', errMsg);
        await speakText(errMsg);
        if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', errMsg);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();

    setTimeout(() => {
        if (interviewActive) startListening();
    }, 250);
}

async function getAndSpeakAIResponse(isInitial = false) {
    if (isProcessingResponse) return;

    isProcessingResponse = true;
    updateAvatarStatus('thinking', 'Thinking...');

    try {
        if (typeof geminiService === 'undefined') {
            const fallback = 'Service unavailable.';
            addToConversationDisplay('bot', fallback);
            await speakText(fallback);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', fallback);
        } else {
            const basePrompt = (typeof memoryManager !== 'undefined' && currentJob && currentJob.systemPrompt)
                ? memoryManager.buildSystemPrompt(currentJob.systemPrompt)
                : (currentJob && currentJob.systemPrompt) || '';
            const systemPrompt = `${basePrompt}\n${BREVITY_INSTRUCTION}`;
            const history = (typeof memoryManager !== 'undefined' && memoryManager.getConversationForAI)
                ? memoryManager.getConversationForAI()
                : [];

            let aiResponse = await geminiService.generateContent(systemPrompt, history);
            aiResponse = String(aiResponse || '');

            const concise = sanitizeAssistantOutput(aiResponse);

            addToConversationDisplay('bot', concise);
            if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', concise);
            await speakText(concise);
        }
    } catch (err) {
        console.error('❌ AI fetch error:', err);
        const errMsg = 'I encountered an error. Please try again.';
        addToConversationDisplay('bot', errMsg);
        await speakText(errMsg);
        if (typeof memoryManager !== 'undefined') memoryManager.addMessage('assistant', errMsg);
    } finally {
        isProcessingResponse = false;
    }

    startNoResponseFlow();
}

function sanitizeAssistantOutput(text) {
    if (!text) return '';

    let cleaned = String(text);

    cleaned = cleaned.replace(/\b(generative language api|generativelanguage|gemini|gpt|llm|model|models|prompt|prompts|api|apis|assistant)\b/ig, '');
    cleaned = cleaned.replace(/\(.*?(model|gemini|api|assistant|prompt).*?\)/ig, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    if (cleaned.length > ASSISTANT_MAX_CHARS) {
        const slice = cleaned.slice(0, ASSISTANT_MAX_CHARS);
        const lastPunct = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPunct > Math.floor(ASSISTANT_MAX_CHARS * 0.5)) {
            cleaned = slice.slice(0, lastPunct + 1);
        } else {
            cleaned = slice.trim() + '...';
        }
    }

    cleaned = cleaned.replace(/^\s*(as an ai[, ]*)/i, '');
    cleaned = cleaned.replace(/^\s*(as an assistant[, ]*)/i, '');

    return cleaned.trim();
}

function waitForRecognitionStop(timeout = 1200) {
    return new Promise((resolve) => {
        if (!recognition || !recognitionActive) return resolve(true);

        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            recognitionActive = false;
            resolve(true);
        };

        const prevOnEnd = recognition.onend;
        recognition.onend = () => {
            try { if (typeof prevOnEnd === 'function') prevOnEnd(); } catch (e) {}
            finish();
        };

        try {
            if (typeof recognition.abort === 'function') {
                try { recognition.abort(); } catch (e) { recognition.stop(); }
            } else {
                recognition.stop();
            }
        } catch (e) { /* ignore */ }

        setTimeout(() => {
            try { recognition.onend = prevOnEnd; } catch (e) {}
            finish();
        }, timeout);
    });
}

function playAudioPrime(durationMs = 80) {
    return new Promise((resolve) => {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return resolve();

            const ctx = new AudioCtx();
            const sampleRate = ctx.sampleRate || 44100;
            const length = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
            const buffer = ctx.createBuffer(1, length, sampleRate);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);

            source.onended = () => {
                try { source.disconnect(); } catch (e) {}
                setTimeout(() => {
                    try { ctx.close(); } catch (e) {}
                    resolve();
                }, 20);
            };

            source.start(0);
        } catch (e) {
            console.warn('⚠️ Audio prime failed', e);
            resolve();
        }
    });
}

async function speakText(text) {
    return new Promise(async (resolve) => {
        if (!window.speechSynthesis) return resolve();

        try {
            await waitForRecognitionStop(1200);
        } catch (e) {
            console.warn('⚠️ waitForRecognitionStop error', e);
        }

        await playAudioPrime(80);
        await new Promise(r => setTimeout(r, PRE_SPEAK_DELAY_MS));

        isAISpeaking = true;
        updateAvatarStatus('speaking', 'Speaking...');

        const utterance = new SpeechSynthesisUtterance(String(text || ''));

        utterance.rate = TTS_RATE;
        utterance.pitch = TTS_PITCH;
        utterance.volume = TTS_VOLUME;
        utterance.lang = 'en-US';

        // IMPROVED: Better voice selection with logging
        try {
            const voices = synthesis.getVoices() || [];
            let preferredVoice = null;

            // Try each preferred voice in order
            for (const preferredName of PREFERRED_VOICE_NAMES) {
                preferredVoice = voices.find(v => 
                    v.name && v.name.toLowerCase().includes(preferredName.toLowerCase())
                );
                if (preferredVoice) {
                    console.log('🔊 Selected voice:', preferredVoice.name);
                    break;
                }
            }

            // Fallback to any English voice
            if (!preferredVoice) {
                preferredVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
                if (preferredVoice) {
                    console.log('🔊 Using fallback English voice:', preferredVoice.name);
                }
            }

            if (preferredVoice) {
                utterance.voice = preferredVoice;
            } else {
                console.log('🔊 Using default system voice');
            }
        } catch (e) {
            console.warn('⚠️ Voice selection error', e);
        }

        utterance.onstart = () => {
            console.log('🗣️ TTS started');
        };

        utterance.onend = async () => {
            console.log('✅ Finished speaking');
            isAISpeaking = false;
            updateAvatarStatus('listening', 'Listening...');

            if (interviewActive && !isProcessingResponse) {
                setTimeout(() => startListening(), 200);
            }
            resolve();
        };

        utterance.onerror = (e) => {
            console.error('❌ Speech error:', e);
            isAISpeaking = false;
            setTimeout(() => startListening(), 200);
            resolve();
        };

        try {
            synthesis.speak(utterance);
        } catch (e) {
            console.warn('⚠️ synthesis.speak failed', e);
            isAISpeaking = false;
            setTimeout(() => startListening(), 200);
            resolve();
        }
    });
}

function updateAvatarStatus(state, text) {
    const avatar = document.getElementById('avatar');
    const status = document.getElementById('avatarStatus');
    if (avatar) avatar.classList.remove('speaking', 'listening', 'thinking');
    if (state && avatar) avatar.classList.add(state);
    if (status) status.textContent = text || '';
}

function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) endInterview();
    }, 1000);
}

function updateTimerDisplay() {
    const timerEl = document.getElementById('timer');
    if (!timerEl) return;
    timerEl.textContent = typeof formatTime === 'function' ? formatTime(timeRemaining) : `${Math.floor(timeRemaining/60)}:${(timeRemaining%60).toString().padStart(2,'0')}`;
    if (typeof CONFIG !== 'undefined') {
        if (timeRemaining <= CONFIG.TIMER_DANGER_THRESHOLD) timerEl.className = 'timer danger';
        else if (timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) timerEl.className = 'timer warning';
        else timerEl.className = 'timer';
    }
}

// UPDATED: Enhanced end interview with closing summary
async function endInterview() {
    if (!interviewActive) return;
    interviewActive = false;

    clearInterval(timerInterval);
    clearTimeout(silenceTimer);
    clearAllNoResponseTimers();

    stopListening();
    try { synthesis.cancel(); } catch (e) { /* ignore */ }

    // Stop camera
    if (cameraStream) {
        const tracks = cameraStream.getTracks();
        tracks.forEach(track => track.stop());
    }

    updateAvatarStatus(null, 'Interview Complete');

    // NEW: Add personalized closing message
    if (typeof memoryManager !== 'undefined' && memoryManager.userInfo) {
        const userName = memoryManager.userInfo.fullName.split(' ')[0];
        const closingMessage = `Thank you, ${userName}! That wraps up our interview. You did well - I'll now analyze your responses and provide detailed feedback.`;
        addToConversationDisplay('bot', closingMessage);
        await speakText(closingMessage);
    }

    setTimeout(() => {
        const modal = document.getElementById('feedbackModal');
        if (modal) modal.classList.add('active');
        if (typeof memoryManager !== 'undefined' && typeof geminiService !== 'undefined') {
            (async () => {
                const data = memoryManager.exportForFeedback();
                const fb = await geminiService.generateFeedback(currentJob, data);
                displayFeedback(fb);
            })();
        }
    }, 2000);
}

function displayFeedback(feedback) {
    const body = document.getElementById('feedbackBody');
    if (!body) return;
    const avg = Math.round(((feedback.scores.communication + feedback.scores.technical + feedback.scores.problemSolving + feedback.scores.professionalism) || 0) / 4);
    body.innerHTML = `
        <div class="feedback-section">
            <h3>📋 Overall Performance</h3>
            <p>${escapeHtml(feedback.overall || '')}</p>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${avg}/10</div>
                    <div class="score-label">Overall Score</div>
                </div>
            </div>
        </div>
        <div class="feedback-section">
            <h3>💪 Strengths</h3>
            <ul>${(feedback.strengths || []).map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
        <div class="feedback-section">
            <h3>🎯 Areas for Improvement</h3>
            <ul>${(feedback.improvements || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
        </div>
        <div class="feedback-section">
            <h3>🔧 Technical Feedback</h3>
            <p>${escapeHtml(feedback.technical || '')}</p>
        </div>
        <div class="feedback-section">
            <h3>💬 Communication Skills</h3>
            <p>${escapeHtml(feedback.communication || '')}</p>
        </div>
        <div class="feedback-section">
            <h3>📚 Recommendations</h3>
            <ul>${(feedback.recommendations || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
        </div>
        <div class="feedback-section">
            <h3>📊 Detailed Scores</h3>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${feedback.scores.communication}/10</div>
                    <div class="score-label">Communication</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.technical}/10</div>
                    <div class="score-label">Technical</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.problemSolving}/10</div>
                    <div class="score-label">Problem Solving</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${feedback.scores.professionalism}/10</div>
                    <div class="score-label">Professionalism</div>
                </div>
            </div>
        </div>
    `;
}

function goBack() {
    if (confirm('Are you sure you want to leave the interview?')) {
        endInterview();
        setTimeout(() => window.location.href = 'index.html', 500);
    }
}

function goHome() {
    window.location.href = 'index.html';
}

function retakeInterview() {
    window.location.reload();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}
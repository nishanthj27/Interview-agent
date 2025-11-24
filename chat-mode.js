// Chat Mode Implementation - FULLY UPDATED with All Conversational Quality Improvements

let currentJob = null;
let timerInterval = null;
let timeRemaining = CONFIG.INTERVIEW_DURATION;
let interviewActive = false;

// Brevity and assistant persona constraints
const ASSISTANT_NAME = 'Nishu One';
const ASSISTANT_MAX_SENTENCES = 2;
const ASSISTANT_MAX_CHARS = 600;

const BREVITY_INSTRUCTION = `
Assistant behavior (IMPORTANT):
- You are "Nishu One", a professional interviewer for the given job role.
- This is a 10-minute timed interview. Keep that in account for pacing and number of questions.
- Always act like an interviewer: start with a brief greeting/introduction, ask role-relevant questions, probe based on candidate answers, and close the interview when appropriate.
- Keep each response concise and human-like: 1–2 short sentences when asking questions or giving short feedback. Do NOT produce multi-paragraph monologues.
- Do NOT mention system internals, API names, model names, or the word "prompt". Avoid self-references (e.g., "as an AI", "the model", "the API").
- If a follow-up is required, ask one clear, specific question at a time.
`;

// Initialize chat mode
document.addEventListener('DOMContentLoaded', () => {
    console.log('💬 Chat mode initialized');
    loadJobInfo();
    initializeChat();
});

// Load job information from session storage
function loadJobInfo() {
    const jobData = sessionStorage.getItem('selectedJob');
    if (!jobData) {
        alert('No job selected. Redirecting to home...');
        window.location.href = 'index.html';
        return;
    }
    
    currentJob = JSON.parse(jobData);
    document.getElementById('jobTitle').textContent = currentJob.title;
    console.log('✅ Job loaded:', currentJob.title);
}

// Initialize chat interface
function initializeChat() {
    const userInput = document.getElementById('userInput');
    
    // Auto-resize textarea
    userInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Send message on Enter (Shift+Enter for new line)
    userInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Start the interview
    startInterview();
}

// Start the interview
async function startInterview() {
    console.log('🎬 Starting interview...');
    interviewActive = true;
    memoryManager.startInterview(currentJob);
    
    // Start timer
    startTimer();
    
    // Remove welcome message
    setTimeout(() => {
        const welcome = document.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }, 1000);
    
    // Get initial greeting from AI
    await getAIResponse(true);
}

// Start the countdown timer
function startTimer() {
    updateTimerDisplay();
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        if (timeRemaining <= 0) {
            console.log('⏰ Time is up!');
            endInterview();
        }
    }, 1000);
}

// Update timer display
function updateTimerDisplay() {
    const timerElement = document.getElementById('timer');
    timerElement.textContent = formatTime(timeRemaining);
    
    // Change color based on time remaining
    if (timeRemaining <= CONFIG.TIMER_DANGER_THRESHOLD) {
        timerElement.className = 'timer danger';
    } else if (timeRemaining <= CONFIG.TIMER_WARNING_THRESHOLD) {
        timerElement.className = 'timer warning';
    } else {
        timerElement.className = 'timer';
    }
}

// Send user message
async function sendMessage() {
    const input = document.getElementById('userInput');
    const message = input.value.trim();
    
    if (!message || !interviewActive) return;
    
    console.log('📤 Sending message:', message);
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    
    // Disable input while processing
    input.disabled = true;
    document.getElementById('sendBtn').disabled = true;
    
    // Display user message
    addMessageToUI('user', message);
    
    // Add to memory
    memoryManager.addMessage('user', message);
    
    // Show typing indicator
    showTypingIndicator();
    
    // Get AI response
    await getAIResponse();
    
    // Re-enable input
    input.disabled = false;
    document.getElementById('sendBtn').disabled = false;
    input.focus();
}

// Sanitize assistant output to enforce brevity
function sanitizeAssistantOutput(text) {
    if (!text) return '';

    let cleaned = String(text);

    // Remove technical references
    cleaned = cleaned.replace(/\b(generative language api|generativelanguage|gemini|gpt|llm|model|models|prompt|prompts|api|apis|assistant)\b/ig, '');
    cleaned = cleaned.replace(/\(.*?(model|gemini|api|assistant|prompt).*?\)/ig, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    // Enforce character limit
    if (cleaned.length > ASSISTANT_MAX_CHARS) {
        const slice = cleaned.slice(0, ASSISTANT_MAX_CHARS);
        const lastPunct = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPunct > Math.floor(ASSISTANT_MAX_CHARS * 0.5)) {
            cleaned = slice.slice(0, lastPunct + 1);
        } else {
            cleaned = slice.trim() + '...';
        }
    }

    // Remove AI self-references
    cleaned = cleaned.replace(/^\s*(as an ai[, ]*)/i, '');
    cleaned = cleaned.replace(/^\s*(as an assistant[, ]*)/i, '');

    return cleaned.trim();
}

// Get AI response
async function getAIResponse(isInitial = false) {
    try {
        console.log('🤖 Getting AI response...');
        
        // Check for repeat request
        if (!isInitial) {
            const lastUserMsg = memoryManager.conversationHistory
                .filter(m => m.role === 'user')
                .pop();
            
            if (lastUserMsg) {
                const repeatQuestion = memoryManager.checkRepeatRequest(lastUserMsg.content);
                if (repeatQuestion) {
                    console.log('🔁 Repeating question');
                    hideTypingIndicator();
                    addMessageToUI('bot', repeatQuestion);
                    memoryManager.addMessage('assistant', repeatQuestion);
                    return;
                }
            }
        }
        
        // Build system prompt with context and brevity instructions
        const basePrompt = memoryManager.buildSystemPrompt(currentJob.systemPrompt);
        const systemPrompt = `${basePrompt}\n${BREVITY_INSTRUCTION}`;
        
        // Get conversation history
        const history = memoryManager.getConversationForAI();
        
        // Generate response
        let response = await geminiService.generateContent(systemPrompt, history);
        console.log('🔥 Raw AI response received');
        
        // Sanitize and enforce brevity
        response = sanitizeAssistantOutput(response);
        console.log('✅ Response sanitized:', response.substring(0, 50) + '...');
        
        // Hide typing indicator
        hideTypingIndicator();
        
        // Add response to UI
        addMessageToUI('bot', response);
        
        // Add to memory
        memoryManager.addMessage('assistant', response);
        
    } catch (error) {
        console.error('❌ Error getting AI response:', error);
        hideTypingIndicator();
        
        const errorMessage = 'I apologize, but I encountered an error. Could you please repeat that?';
        addMessageToUI('bot', errorMessage);
        memoryManager.addMessage('assistant', errorMessage);
    }
}

// Add message to UI
function addMessageToUI(type, content) {
    const messagesWrapper = document.getElementById('messagesWrapper');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    avatarDiv.textContent = type === 'bot' ? '🎙️' : '👤';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `
        <div>${escapeHtml(content)}</div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);
    messagesWrapper.appendChild(messageDiv);
    
    // Scroll to bottom
    messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = 'flex';
}

// Hide typing indicator
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    indicator.style.display = 'none';
}

// UPDATED: Enhanced end interview with closing summary
async function endInterview() {
    if (!interviewActive) return;
    
    console.log('🔴 Ending interview...');
    interviewActive = false;
    clearInterval(timerInterval);
    
    // Disable input
    document.getElementById('userInput').disabled = true;
    document.getElementById('sendBtn').disabled = true;
    
    // NEW: Add personalized closing message
    const userName = memoryManager.userInfo ? memoryManager.userInfo.fullName.split(' ')[0] : 'there';
    const closingMessage = `Thank you, ${userName}! That wraps up our interview. You did well - I'll now analyze your responses and provide detailed feedback.`;
    
    addMessageToUI('bot', closingMessage);
    
    // Brief delay before showing feedback
    setTimeout(() => {
        showFeedbackModal();
    }, 2000);
}

// Show feedback modal
async function showFeedbackModal() {
    console.log('📊 Showing feedback modal...');
    const modal = document.getElementById('feedbackModal');
    if (!modal) {
        console.error('❌ Feedback modal not found!');
        alert('Error: Feedback modal not found. Please refresh the page.');
        return;
    }
    
    modal.classList.add('active');
    console.log('✅ Feedback modal opened');
    
    try {
        // Generate feedback
        console.log('🤖 Generating feedback...');
        const conversationData = memoryManager.exportForFeedback();
        console.log('📄 Conversation data exported:', {
            messages: conversationData.messagesWindow?.length || 0,
            stats: conversationData.stats
        });
        
        const feedback = await geminiService.generateFeedback(currentJob, conversationData);
        console.log('✅ Feedback generated successfully');
        
        // Display feedback
        displayFeedback(feedback);
        console.log('✅ Feedback displayed');
    } catch (error) {
        console.error('❌ Error generating/displaying feedback:', error);
        
        // Display error message to user
        const feedbackBody = document.getElementById('feedbackBody');
        if (feedbackBody) {
            feedbackBody.innerHTML = `
                <div class="feedback-section">
                    <h3>⚠️ Error Generating Feedback</h3>
                    <p>We encountered an error while generating your feedback. Please try again.</p>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Error: ${escapeHtml(error.message || 'Unknown error')}</p>
                    <button class="btn-primary" onclick="retakeInterview()" style="margin-top: 1rem;">Try Again</button>
                </div>
            `;
        }
    }
}

// Display feedback (with safety checks)
function displayFeedback(feedback) {
    console.log('🎨 Displaying feedback...');
    const feedbackBody = document.getElementById('feedbackBody');
    
    if (!feedbackBody) {
        console.error('❌ Feedback body element not found!');
        return;
    }
    
    // Safety checks for feedback object
    const scores = feedback.scores || { 
        communication: 5, 
        technical: 5, 
        problemSolving: 5, 
        professionalism: 5 
    };
    
    const avgScore = Math.round(
        (scores.communication + 
         scores.technical + 
         scores.problemSolving + 
         scores.professionalism) / 4
    );
    
    feedbackBody.innerHTML = `
        <div class="feedback-section">
            <h3>📋 Overall Performance</h3>
            <p>${escapeHtml(feedback.overall || 'Feedback not available')}</p>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${avgScore}/10</div>
                    <div class="score-label">Overall Score</div>
                </div>
            </div>
        </div>
        
        <div class="feedback-section">
            <h3>💪 Strengths</h3>
            <ul>
                ${(feedback.strengths || ['No strengths recorded']).map(s => `<li>${escapeHtml(s)}</li>`).join('')}
            </ul>
        </div>
        
        <div class="feedback-section">
            <h3>🎯 Areas for Improvement</h3>
            <ul>
                ${(feedback.improvements || ['No improvements recorded']).map(i => `<li>${escapeHtml(i)}</li>`).join('')}
            </ul>
        </div>
        
        <div class="feedback-section">
            <h3>🔧 Technical Feedback</h3>
            <p>${escapeHtml(feedback.technical || 'No technical feedback available')}</p>
        </div>
        
        <div class="feedback-section">
            <h3>💬 Communication Skills</h3>
            <p>${escapeHtml(feedback.communication || 'No communication feedback available')}</p>
        </div>
        
        <div class="feedback-section">
            <h3>📚 Recommendations</h3>
            <ul>
                ${(feedback.recommendations || ['No recommendations available']).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
        </div>
        
        <div class="feedback-section">
            <h3>📊 Detailed Scores</h3>
            <div class="score-display">
                <div class="score-item">
                    <div class="score-value">${scores.communication}/10</div>
                    <div class="score-label">Communication</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.technical}/10</div>
                    <div class="score-label">Technical</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.problemSolving}/10</div>
                    <div class="score-label">Problem Solving</div>
                </div>
                <div class="score-item">
                    <div class="score-value">${scores.professionalism}/10</div>
                    <div class="score-label">Professionalism</div>
                </div>
            </div>
        </div>
    `;
    
    console.log('✅ Feedback rendered to UI');
}

// Navigation functions
function goBack() {
    if (confirm('Are you sure you want to leave the interview?')) {
        window.location.href = 'index.html';
    }
}

function goHome() {
    window.location.href = 'index.html';
}

function retakeInterview() {
    window.location.reload();
}

// Utility function to format time
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Utility function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
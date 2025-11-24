// Memory and Context Management System - FULLY UPDATED with All Conversational Improvements

class MemoryManager {
    constructor() {
        this.conversationHistory = [];
        this.interviewStartTime = null;
        this.questionCount = 0;
        this.userResponses = [];
        this.topicsCovered = new Set();
        this.userInfo = null;
        this.responseQualityHistory = []; // NEW: Track response quality for adaptation
        this.lastResponseQuality = null; // NEW: Last response quality level
        this.currentContext = {
            phase: 'introduction',
            lastQuestionTime: null,
            lastUserResponseTime: null,
            silenceWarningGiven: false
        };
    }

    // Initialize interview session with user info
    startInterview(jobRole) {
        this.interviewStartTime = Date.now();
        this.conversationHistory = [];
        this.questionCount = 0;
        this.userResponses = [];
        this.topicsCovered.clear();
        this.responseQualityHistory = [];
        this.lastResponseQuality = null;
        this.currentContext.phase = 'introduction';
        
        this.loadUserInfo();
        
        console.log(`Interview started for role: ${jobRole.title}`);
        if (this.userInfo) {
            console.log(`Candidate: ${this.userInfo.fullName} from ${this.userInfo.organization}`);
        }
    }

    // Load user information from sessionStorage
    loadUserInfo() {
        try {
            const userInfoData = sessionStorage.getItem('userInfo');
            if (userInfoData) {
                this.userInfo = JSON.parse(userInfoData);
                console.log('✅ User info loaded successfully:', this.userInfo);
            } else {
                console.warn('⚠️ No user info found in sessionStorage');
                this.userInfo = null;
            }
        } catch (error) {
            console.error('❌ Error loading user info:', error);
            this.userInfo = null;
        }
    }

    // Get user info context for AI
    getUserInfoContext() {
        if (!this.userInfo) {
            return '';
        }

        return `
Candidate Information:
- Name: ${this.userInfo.fullName}
- Organization/Institution: ${this.userInfo.organization}
- Education: ${this.userInfo.degree}
- Current Position: ${this.userInfo.currentRole}

Use this information to personalize the interview experience. For example:
- Reference their educational background when relevant
- Tailor questions to their current role or student status
- Use their name occasionally to make it more personal
- Adjust difficulty based on whether they're a student or working professional
- Ask about relevant experiences from their organization if appropriate
`.trim();
    }

    // NEW: Track and analyze response quality
    trackResponseQuality(response) {
        if (!response || typeof response !== 'string') return 'unknown';

        const length = response.trim().length;
        const wordCount = response.split(/\s+/).length;
        
        // Technical keyword detection
        const technicalKeywords = [
            'algorithm', 'architecture', 'design', 'implementation', 'optimization',
            'database', 'api', 'framework', 'testing', 'deployment', 'scalability',
            'performance', 'security', 'cloud', 'microservices', 'system'
        ];
        
        const hasTechnicalContent = technicalKeywords.some(keyword => 
            response.toLowerCase().includes(keyword)
        );

        // STAR method indicators
        const hasStructure = /situation|task|action|result|challenge|solution|outcome/i.test(response);

        let quality = {
            level: 'moderate',
            length: length,
            wordCount: wordCount,
            hasTechnicalContent: hasTechnicalContent,
            hasStructure: hasStructure,
            isVeryBrief: length < 50,
            isBrief: length < 150,
            isDetailed: length > 200,
            isVeryDetailed: length > 400
        };

        // Determine quality level
        if (quality.isVeryBrief) {
            quality.level = 'very_brief';
        } else if (quality.isBrief && !hasTechnicalContent) {
            quality.level = 'brief';
        } else if (quality.isDetailed && hasTechnicalContent && hasStructure) {
            quality.level = 'excellent';
        } else if (quality.isDetailed && hasTechnicalContent) {
            quality.level = 'good';
        } else if (quality.isDetailed) {
            quality.level = 'detailed';
        }

        this.responseQualityHistory.push(quality);
        this.lastResponseQuality = quality;

        console.log('📊 Response Quality:', quality.level, `(${length} chars, ${wordCount} words)`);

        return quality.level;
    }

    // NEW: Get adaptive difficulty instruction
    getAdaptiveDifficultyInstruction() {
        if (!this.lastResponseQuality) return '';

        const quality = this.lastResponseQuality;
        
        if (quality.level === 'very_brief') {
            return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer was very brief (${quality.length} chars)
- Encourage elaboration with: "Could you provide a specific example?"
- Or probe deeper: "What was your thought process behind that?"
- Or rephrase: "Let me ask that differently..."`;
        }

        if (quality.level === 'brief') {
            return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer lacked depth
- Follow up with: "Can you walk me through the details?"
- Or: "What challenges did you face?"`;
        }

        if (quality.level === 'excellent' || quality.level === 'good') {
            return `
IMPORTANT - NEXT QUESTION ADAPTATION:
- Previous answer was strong and detailed
- You can increase difficulty or dive deeper
- Ask about edge cases, trade-offs, or alternatives`;
        }

        return '';
    }

    // Add a message to conversation history
    addMessage(role, content, timestamp = Date.now()) {
        const message = {
            role,
            content,
            timestamp,
            phase: this.currentContext.phase
        };
        
        this.conversationHistory.push(message);
        
        if (role === 'assistant') {
            this.questionCount++;
            this.currentContext.lastQuestionTime = timestamp;
        } else if (role === 'user') {
            this.userResponses.push(content);
            this.currentContext.lastUserResponseTime = timestamp;
            this.currentContext.silenceWarningGiven = false;
            this.extractTopics(content);
            this.trackResponseQuality(content); // Track quality
        }
        
        this.updatePhase();
        
        return message;
    }

    // Extract topics from user response
    extractTopics(content) {
        const keywords = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
        keywords.forEach(keyword => this.topicsCovered.add(keyword));
    }

    // Update interview phase
    updatePhase() {
        if (this.questionCount <= 2) {
            this.currentContext.phase = 'introduction';
        } else if (this.questionCount <= 8) {
            this.currentContext.phase = 'main';
        } else {
            this.currentContext.phase = 'closing';
        }
    }

    // Get conversation history for AI
    getConversationForAI() {
        return this.conversationHistory.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));
    }

    // Get first question from history
    getFirstQuestion() {
        const firstAssistantMsg = this.conversationHistory.find(
            msg => msg.role === 'assistant'
        );
        return firstAssistantMsg ? firstAssistantMsg.content : null;
    }

    // Get question by index (1-based)
    getQuestionByIndex(index) {
        const assistantMessages = this.conversationHistory.filter(
            msg => msg.role === 'assistant'
        );
        return assistantMessages[index - 1]?.content || null;
    }

    // NEW: Get last few messages for context reference
    getRecentMessages(count = 3) {
        return this.conversationHistory.slice(-count);
    }

    // Check for request to repeat questions
    checkRepeatRequest(userMessage) {
        const lowerMsg = userMessage.toLowerCase();
        const repeatPhrases = [
            'repeat', 'say again', 'what was', 'can you repeat',
            'again', 'didn\'t hear', 'missed that', 'pardon'
        ];
        
        const isRepeatRequest = repeatPhrases.some(phrase => 
            lowerMsg.includes(phrase)
        );
        
        if (!isRepeatRequest) return null;
        
        if (lowerMsg.includes('first') || lowerMsg.includes('1st')) {
            return this.getQuestionByIndex(1);
        }
        
        const assistantMessages = this.conversationHistory.filter(
            msg => msg.role === 'assistant'
        );
        return assistantMessages[assistantMessages.length - 1]?.content || null;
    }

    // Check if user has been silent too long
    checkSilence() {
        if (!this.currentContext.lastQuestionTime) return false;
        
        const now = Date.now();
        const lastResponseTime = this.currentContext.lastUserResponseTime || 
                                 this.currentContext.lastQuestionTime;
        const silenceDuration = now - lastResponseTime;
        
        return silenceDuration > CONFIG.SILENCE_THRESHOLD && 
               !this.currentContext.silenceWarningGiven;
    }

    // Mark silence warning as given
    markSilenceWarning() {
        this.currentContext.silenceWarningGiven = true;
    }

    // Get interview statistics
    getInterviewStats() {
        const duration = this.interviewStartTime ? 
            (Date.now() - this.interviewStartTime) / 1000 : 0;
        
        return {
            duration: Math.floor(duration),
            questionCount: this.questionCount,
            responseCount: this.userResponses.length,
            topicsCovered: Array.from(this.topicsCovered),
            averageResponseLength: this.userResponses.length > 0 ?
                this.userResponses.reduce((sum, r) => sum + r.length, 0) / 
                this.userResponses.length : 0,
            phase: this.currentContext.phase,
            userInfo: this.userInfo,
            responseQuality: this.responseQualityHistory
        };
    }

    // Assess response quality
    assessResponseQuality() {
        if (this.userResponses.length === 0) return 'No responses yet';
        
        const avgLength = this.userResponses.reduce((sum, r) => sum + r.length, 0) / 
                         this.userResponses.length;
        
        if (avgLength < 20) return 'Very brief responses - needs improvement';
        if (avgLength < 50) return 'Brief responses - could add more detail';
        if (avgLength < 150) return 'Moderate responses - good baseline';
        if (avgLength < 300) return 'Detailed responses - excellent depth';
        return 'Very detailed responses - comprehensive answers';
    }

    // Generate context summary for AI
    getContextSummary() {
        const stats = this.getInterviewStats();
        
        let summary = `
Interview Context:
- Duration: ${Math.floor(stats.duration / 60)} minutes ${stats.duration % 60} seconds
- Phase: ${stats.phase}
- Questions Asked: ${stats.questionCount}
- User Responses: ${stats.responseCount}
- Topics Discussed: ${stats.topicsCovered.slice(0, 10).join(', ')}
- Response Quality: ${this.assessResponseQuality()}
        `.trim();

        const userContext = this.getUserInfoContext();
        if (userContext) {
            summary += '\n\n' + userContext;
        }

        return summary;
    }

    // FULLY UPDATED: Build enhanced system prompt with all improvements
    buildSystemPrompt(basePrompt) {
        const contextSummary = this.getContextSummary();
        const firstName = this.userInfo ? this.userInfo.fullName.split(' ')[0] : 'there';
        
        let enhancedPrompt = `${basePrompt}

Current Interview Context:
${contextSummary}

PERSONALITY TRAITS (Nishu One - Your Interviewer Persona):
- Professional yet warm and encouraging
- Patient and supportive - this is practice, not a real high-stakes interview
- Shows genuine interest in the candidate's experiences and learning
- Occasionally uses light encouragement to ease tension
- Celebrates good answers: "Excellent example!", "That's a solid approach!"
- Gently probes unclear answers: "Could you elaborate on that?", "What made you choose that approach?"
- Uses natural acknowledgments before transitions

NATURAL CONVERSATION RULES:
- Use brief acknowledgments (2-4 words) before asking next question
- Vary your acknowledgments: "I see", "Interesting", "Makes sense", "Good point", "Fair enough"
- Occasionally reflect back key points: "So you're saying [brief summary]..."
- Build on previous answers: "You mentioned [topic] - how does that relate to..."
- Reference their name occasionally: "${firstName}, tell me about..."
- Don't overdo acknowledgments - keep them natural and brief
- Example flow: "Interesting. Now, building on that..." OR "I see. Let's explore..."

CONTEXT-AWARE FOLLOW-UPS (CRITICAL):
- Always reference previous answers when asking follow-ups
- Connect questions logically based on what they've shared
- Example: "You mentioned working with React - how do you handle state management in larger applications?"
- Example: "Since you have experience with ${this.topicsCovered.size > 0 ? Array.from(this.topicsCovered)[0] : 'that technology'}, how would you approach..."
- Show active listening by building on their responses

Adaptive Behavior:
- If user seems confused, provide hints or rephrase
- If responses are too brief, encourage elaboration with follow-ups
- If user goes off-topic, gently redirect: "That's interesting, but let's focus on..."
- If user asks to repeat a question, provide it naturally
- Maintain professional but friendly tone throughout
- Ask one clear question at a time
- Listen actively to answers before proceeding
- Adapt difficulty based on their responses`;

        // Adaptive difficulty based on response quality
        const adaptiveInstruction = this.getAdaptiveDifficultyInstruction();
        if (adaptiveInstruction) {
            enhancedPrompt += '\n' + adaptiveInstruction;
        }

        // User-specific adaptations
        if (this.userInfo) {
            enhancedPrompt += `

PERSONALIZATION INSTRUCTIONS:
- Candidate's name: ${this.userInfo.fullName} (use "${firstName}" for casual reference)
- Their background: ${this.userInfo.organization}
- Education: ${this.userInfo.degree}
- Current status: ${this.userInfo.currentRole}
- Use their name naturally 2-3 times during the interview
- Reference their organization when relevant: "How do things work at ${this.userInfo.organization}?"
- Connect questions to their educational background when appropriate`;
            
            // Student-specific adaptations
            if (this.userInfo.currentRole.toLowerCase().includes('student')) {
                enhancedPrompt += `

⭐ CRITICAL - STUDENT ADAPTATIONS:
This candidate is a STUDENT - adjust ALL expectations and questions accordingly!

Question Guidelines for Students:
- Focus on: Academic projects, coursework, lab work, internships, hackathons
- Ask about: Class projects, team assignments, research work, personal projects
- Expect: Theoretical knowledge, learning experiences, academic achievements
- DON'T ask about: Production systems, enterprise experience, managing teams
- DO ask about: "What projects have you built in your courses?", "Tell me about your capstone project"
- Tone: Encouraging and educational - help them learn interview skills
- Difficulty: Entry-level appropriate, focus on fundamentals and potential
- Examples of good questions:
  * "What's the most challenging project you've worked on in your classes?"
  * "Tell me about a time you had to learn a new technology for a school project"
  * "How do you approach debugging when working on assignments?"
  * "What concepts from your ${this.userInfo.degree} courses interest you most?"

Remember: Students are building experience - focus on their potential, learning ability, and academic work!`;
            } else {
                enhancedPrompt += `

⭐ PROFESSIONAL ADAPTATIONS:
This candidate is a working professional: ${this.userInfo.currentRole}

Question Guidelines for Professionals:
- Expect: Real-world experience, production knowledge, team collaboration
- Ask about: Actual projects they've shipped, technical decisions they've made
- Focus on: Problem-solving in real scenarios, handling production issues
- Probe for: Leadership, mentoring, architectural decisions, trade-offs
- Difficulty: Match their stated role level (junior/senior/lead)
- Examples of good questions:
  * "Tell me about a production issue you diagnosed and resolved"
  * "How do you handle technical debt in your current role?"
  * "Describe a time you had to make a critical architectural decision"
  * "How do you mentor junior developers on your team?"

Remember: Professionals should demonstrate practical experience and decision-making ability!`;
            }
        }

        // Phase-specific guidance
        if (this.currentContext.phase === 'introduction') {
            enhancedPrompt += `

CURRENT PHASE: Introduction
- Keep it warm and welcoming
- Use their name in greeting: "Hi ${firstName}, great to meet you!"
- Start with easier questions to build rapport
- Set a comfortable tone for the rest of the interview`;
        } else if (this.currentContext.phase === 'closing') {
            enhancedPrompt += `

CURRENT PHASE: Closing
- Start wrapping up naturally
- Maybe ask: "Before we finish, is there anything you'd like to add?"
- Thank them for their time
- Keep it brief - interview is almost over`;
        }

        enhancedPrompt += `

Remember: You are Nishu One, a supportive interviewer helping ${firstName} practice. Be conversational, reference their previous answers, and create a natural flow. This is a realistic interview simulation - be supportive but thorough.`;

        return enhancedPrompt;
    }

    // Clear all memory
    reset() {
        this.conversationHistory = [];
        this.interviewStartTime = null;
        this.questionCount = 0;
        this.userResponses = [];
        this.topicsCovered.clear();
        this.userInfo = null;
        this.responseQualityHistory = [];
        this.lastResponseQuality = null;
        this.currentContext = {
            phase: 'introduction',
            lastQuestionTime: null,
            lastUserResponseTime: null,
            silenceWarningGiven: false
        };
    }

    // Export conversation for feedback (enhanced with user info)
    exportForFeedback() {
        const maxMsgs = (CONFIG.FEEDBACK && CONFIG.FEEDBACK.MAX_HISTORY_MESSAGES) ? CONFIG.FEEDBACK.MAX_HISTORY_MESSAGES : 30;
        const msgs = this.conversationHistory.slice(-maxMsgs).map((m, idx) => ({
            index: idx + 1,
            globalIndex: this.conversationHistory.indexOf(m),
            role: m.role,
            content: m.content,
            timestamp: m.timestamp
        }));

        const latencies = [];
        for (let i = 0; i < this.conversationHistory.length; i++) {
            const msg = this.conversationHistory[i];
            if (msg.role === 'assistant') {
                for (let j = i+1; j < this.conversationHistory.length; j++) {
                    const next = this.conversationHistory[j];
                    if (next.role === 'user') {
                        const latency = next.timestamp - msg.timestamp;
                        if (latency >= 0) latencies.push(latency);
                        break;
                    }
                }
            }
        }
        const averageResponseLatency = latencies.length > 0 ? Math.round(latencies.reduce((a,b) => a + b, 0) / latencies.length) : null;

        const fillerWords = ['uh', 'um', 'hmm', 'mm', 'ah', 'erm'];
        let fillerCount = 0;
        this.userResponses.forEach(r => {
            const t = r.trim().toLowerCase();
            if (t.length <= 5 || fillerWords.some(f => t === f || t.startsWith(f + ' ') || t.includes(' ' + f + ' '))) fillerCount++;
        });
        const fillerRate = this.userResponses.length > 0 ? (fillerCount / this.userResponses.length) : 0;

        const stats = this.getInterviewStats();

        const metrics = {
            durationSeconds: stats.duration,
            questionCount: stats.questionCount,
            responseCount: stats.responseCount,
            averageResponseLengthChars: Math.round(stats.averageResponseLength || 0),
            averageResponseLatencyMs: averageResponseLatency,
            fillerRate: Number(fillerRate.toFixed(3)),
            topicsCovered: stats.topicsCovered,
            phase: stats.phase,
            userInfo: this.userInfo,
            responseQualityDistribution: this.getQualityDistribution()
        };

        return {
            conversation: this.conversationHistory,
            stats: metrics,
            responses: this.userResponses,
            messagesWindow: msgs,
            userInfo: this.userInfo
        };
    }

    // NEW: Get distribution of response quality levels
    getQualityDistribution() {
        const distribution = {
            very_brief: 0,
            brief: 0,
            moderate: 0,
            detailed: 0,
            good: 0,
            excellent: 0
        };

        this.responseQualityHistory.forEach(q => {
            if (distribution.hasOwnProperty(q.level)) {
                distribution[q.level]++;
            }
        });

        return distribution;
    }
}

// Create global instance
const memoryManager = new MemoryManager();
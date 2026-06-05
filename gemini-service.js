// Gemini API Service with intelligent feedback evaluation (robust extraction)

// NOTE: Replace the existing file with this content.

class GeminiService {
    constructor() {
        this.currentModel = CONFIG.PRIMARY_MODEL;
        this.apiEndpoint = '/api/gemini';
        this.requestCount = 0;
        this.failureCount = 0;
    }

    // Generate content using Gemini API
    async generateContent(systemPrompt, conversationHistory) {
        try {
            const response = await this.makeRequest(
                systemPrompt,
                conversationHistory
            );
            this.failureCount = 0;
            return response;
        } catch (error) {
            console.error(`Error with ${this.currentModel}:`, error);
            this.failureCount++;

            if (this.currentModel === CONFIG.PRIMARY_MODEL && this.failureCount >= 2) {
                console.log('Switching to fallback model...');
                this.currentModel = CONFIG.FALLBACK_MODEL;

                try {
                    const response = await this.makeRequest(
                        systemPrompt,
                        conversationHistory
                    );
                    this.failureCount = 0;
                    return response;
                } catch (fallbackError) {
                    console.error('Fallback model also failed:', fallbackError);
                    throw new Error('Both primary and fallback models failed. Please check your API configuration.');
                }
            }

            throw error;
        }
    }

    // Make API request (defensive extraction of response text)
    async makeRequest(systemPrompt, conversationHistory) {
        this.requestCount++;

        const requestBody = {
            systemPrompt,
            conversationHistory
        };

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        // defensive: if not ok, try to read any JSON error message
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
                `API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`
            );
        }

        // parse body safely
        const data = await response.json().catch(() => null);
        if (!data) {
            throw new Error('API returned empty response body');
        }

        // Try to extract text robustly from many possible response shapes
        try {
            const extracted = this.extractTextFromResponse(data);
            if (!extracted || typeof extracted !== 'string' || extracted.trim().length === 0) {
                console.warn('makeRequest: extracted text was empty — returning stringified body as fallback.');
                return JSON.stringify(data);
            }
            return extracted;
        } catch (e) {
            // If extraction fails unexpectedly, return stringified data to allow upper layers to attempt parsing/repair
            console.warn('makeRequest: extraction failed, returning full JSON as fallback.', e);
            return JSON.stringify(data);
        }
    }

    // Robust extractor that tries several common shapes returned by different API variants
    extractTextFromResponse(data) {
        // Helper to check nested properties safely
        function get(obj, path) {
            return path.split('.').reduce((a, k) => (a && a[k] !== undefined) ? a[k] : undefined, obj);
        }

        // 1) canonical: data.candidates[0].content.parts[0].text
        const cand0 = get(data, 'candidates.0');
        if (cand0) {
            // many APIs use candidate.content.parts array
            const parts = get(cand0, 'content.parts');
            if (Array.isArray(parts) && parts.length > 0 && typeof parts[0].text === 'string') {
                return parts.map(p => p.text).join('\n');
            }

            // candidate.content might be a string
            const contentStr = get(cand0, 'content');
            if (typeof contentStr === 'string' && contentStr.trim().length > 0) {
                return contentStr;
            }

            // some shapes: candidate.text or candidate.outputText
            if (typeof cand0.text === 'string' && cand0.text.trim().length > 0) return cand0.text;
            if (typeof cand0.outputText === 'string' && cand0.outputText.trim().length > 0) return cand0.outputText;

            // some variants include outputs array
            const outputs = get(data, 'outputs') || get(cand0, 'outputs') || get(data, 'output');
            if (Array.isArray(outputs) && outputs.length > 0) {
                // find first text-like entry
                for (const o of outputs) {
                    if (typeof o === 'string' && o.trim().length > 0) return o;
                    if (o && typeof o.text === 'string' && o.text.trim().length > 0) return o.text;
                    if (o && o.outputText && typeof o.outputText === 'string' && o.outputText.trim().length > 0) return o.outputText;
                    // content parts nested
                    if (o && o.content && Array.isArray(o.content) && o.content[0] && typeof o.content[0].text === 'string') {
                        return o.content.map(c => c.text).join('\n');
                    }
                }
            }
        }

        // 2) direct text at top-level
        if (typeof data.text === 'string' && data.text.trim().length > 0) return data.text;
        if (typeof data.outputText === 'string' && data.outputText.trim().length > 0) return data.outputText;

        // 3) try to find first string value deep in object (last-resort)
        const findFirstString = (obj, depth = 0) => {
            if (depth > 6) return null;
            if (typeof obj === 'string' && obj.trim().length > 0) return obj;
            if (Array.isArray(obj)) {
                for (const el of obj) {
                    const s = findFirstString(el, depth + 1);
                    if (s) return s;
                }
            } else if (obj && typeof obj === 'object') {
                for (const k of Object.keys(obj)) {
                    const s = findFirstString(obj[k], depth + 1);
                    if (s) return s;
                }
            }
            return null;
        };

        const fallback = findFirstString(data);
        if (fallback) {
            return fallback;
        }

        // Final fallback: return JSON string so higher layers can attempt to recover
        return JSON.stringify(data);
    }

    // Generate feedback analysis with intelligent scoring (updated)
// Updated section of gemini-service.js - generateFeedback method
// This shows the modified feedback generation that includes user info

// Add this updated method to your existing gemini-service.js
// Replace the existing generateFeedback method with this one

async generateFeedback(jobRole, conversationData) {
    const maxRetries = (CONFIG.FEEDBACK && CONFIG.FEEDBACK.RETRIES) ? CONFIG.FEEDBACK.RETRIES : 2;
    const requireJson = (CONFIG.FEEDBACK && CONFIG.FEEDBACK.REQUIRE_JSON) ? CONFIG.FEEDBACK.REQUIRE_JSON : true;
    const minImprovements = (CONFIG.FEEDBACK && CONFIG.FEEDBACK.MIN_IMPROVEMENTS) ? CONFIG.FEEDBACK.MIN_IMPROVEMENTS : 3;
    const confidenceThreshold = (CONFIG.FEEDBACK && CONFIG.FEEDBACK.CONFIDENCE_THRESHOLD) ? CONFIG.FEEDBACK.CONFIDENCE_THRESHOLD : 0.35;

    // Build message window safely
    const msgsWindow = (conversationData && conversationData.messagesWindow) ? conversationData.messagesWindow : [];
    const shortMessages = msgsWindow.map(m => {
        const content = (m.content || '');
        const trimmed = content.length > 600 ? content.slice(0, 600) + '...' : content;
        return `${m.index}. ${m.role.toUpperCase()}: ${trimmed}`;
    }).join('\n');

    const metrics = conversationData && conversationData.stats ? conversationData.stats : {};
    
    // NEW: Include user information in feedback context
    const userInfo = conversationData && conversationData.userInfo ? conversationData.userInfo : null;
    let userInfoText = '';
    
    if (userInfo) {
        userInfoText = `
Candidate Profile:
- Name: ${userInfo.fullName}
- Organization/Institution: ${userInfo.organization}
- Education: ${userInfo.degree}
- Current Role/Status: ${userInfo.currentRole}

Note: Consider this background when providing personalized feedback and recommendations.
`;
    }
    
    const metricsText = `
Interview Metrics:
- Duration (s): ${metrics.durationSeconds || 0}
- Questions asked: ${metrics.questionCount || 0}
- User responses: ${metrics.responseCount || 0}
- Avg response length (chars): ${metrics.averageResponseLengthChars || 0}
- Avg response latency (ms): ${metrics.averageResponseLatencyMs || 'N/A'}
- Filler rate: ${metrics.fillerRate || 0}
`.trim();

    const rubricText = `Rubric: ${JSON.stringify(CONFIG.FEEDBACK_RUBRIC || {}).slice(0, 2000)}`;

    const fewShot = `
Example 1:
Messages:
1. ASSISTANT: Tell me about a project you built.
2. USER: I built a web app using React and Node. It had authentication and used PostgreSQL.
3. ASSISTANT: How did you handle scaling?
4. USER: We used basic optimization...

Expected JSON (example):
{
  "overall": "User provided concise answers but lacked depth in scaling specifics.",
  "strengths": ["Clear description of stack","Mentioned database and auth"],
  "improvements": ["Provide specific performance metrics","Explain design choices for scaling","Include trade-offs made"],
  "technical": "Good stack knowledge but lacks depth on scaling.",
  "communication": "Clear but short; provide more structured examples.",
  "recommendations": ["Prepare metrics", "Use STAR structure", "Practice deeper technical explanations"],
  "scores": {"communication":6,"technical":5,"problemSolving":5,"professionalism":7},
  "evidence": [{"msgIndex":2,"excerpt":"I built a web app using React and Node","role":"user"}],
  "confidence": 0.85
}
`.trim();

    let feedbackPrompt = `
You are an expert interview evaluator. Produce structured feedback for the candidate for the role: "${jobRole.title}".

${userInfoText}

${rubricText}

${metricsText}

Transcript (most recent messages):
${shortMessages}

${fewShot}

Task:
- Analyze the transcript and produce a JSON object ONLY (no extra text). The JSON MUST follow this schema:

{
  "overall": "string",
  "strengths": ["string","string",...],
  "improvements": ["string","string",...],
  "technical": "string",
  "communication": "string",
  "recommendations": ["string","string",...],
  "scores": { "communication": int, "technical": int, "problemSolving": int, "professionalism": int },
  "evidence": [ { "msgIndex": int, "excerpt": "string", "role": "user|assistant" } ],
  "confidence": number
}

Important:
- Ensure "improvements" are explicitly tied to the job role "${jobRole.title}".
- Provide at least ${minImprovements} concrete improvements.
- ${userInfo ? `Personalize feedback for ${userInfo.fullName}, considering their background at ${userInfo.organization} and current status as ${userInfo.currentRole}.` : ''}
- ${userInfo && userInfo.currentRole.toLowerCase().includes('student') ? 'Since this is a student, focus feedback on building foundational skills, academic projects, and preparing for entry-level positions.' : ''}
- If you cannot answer, return confidence < ${confidenceThreshold}.
`;

    if (requireJson) {
        feedbackPrompt += `\n\nIMPORTANT: Output valid JSON only. Do not include any additional commentary.`;
    }

    let lastError = null;
    this.currentModel = CONFIG.PRIMARY_MODEL;
    this.failureCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const raw = await this.makeRequest(feedbackPrompt, []);
                let parsed = null;
                try {
                    parsed = JSON.parse(raw);
                } catch (parseErr) {
                    const jsonMatch = raw && raw.match ? raw.match(/\{[\s\S]*\}$/) || raw.match(/\{[\s\S]*\}/) : null;
                    if (jsonMatch && jsonMatch[0]) {
                        try { parsed = JSON.parse(jsonMatch[0]); } catch (e) { parsed = null; }
                    }
                }

                if (!parsed) {
                    lastError = new Error('Model output not valid JSON');
                    if (attempt < maxRetries) {
                        const repairPrompt = `
Previous model output was not valid JSON. Here is the raw output:
-----
${raw}
-----
Please return valid JSON ONLY that follows the required schema.
`;
                        await this.makeRequest(repairPrompt, []);
                        continue;
                    } else {
                        break;
                    }
                }

                const validated = this.validateParsedFeedback(parsed, conversationData, jobRole);
                const conf = (typeof validated.parsedFeedback.confidence === 'number') ? validated.parsedFeedback.confidence : (validated.confidence || 0.5);

                if (conf < confidenceThreshold && attempt < maxRetries) {
                    lastError = new Error(`Low confidence from model (${conf})`);
                    const repairPrompt = `
The JSON returned a low confidence (${conf}). Please re-evaluate and output valid JSON with role-specific improvements for "${jobRole.title}".
${userInfo ? `Remember to personalize for ${userInfo.fullName}.` : ''}
`;
                    await this.makeRequest(repairPrompt, []);
                    continue;
                }

                const finalFeedback = this.ensureAllFields(validated.parsedFeedback, conversationData, jobRole);
                return finalFeedback;

            } catch (err) {
                console.error('generateFeedback attempt error:', err);
                lastError = err;
                this.failureCount++;
                if (this.currentModel === CONFIG.PRIMARY_MODEL && this.failureCount >= 2) {
                    this.currentModel = CONFIG.FALLBACK_MODEL;
                }
                await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
                continue;
            }
        }

    // Fallback with user info consideration
    console.error('All attempts failed or produced invalid JSON. Last error:', lastError);
    try {
        const stats = conversationData.stats || {};
        const participationRate = stats.responseCount || 0;
        const avgLen = stats.averageResponseLengthChars || 0;

        const fallback = this.getDefaultFeedback(participationRate, avgLen);

        const roleHint = jobRole && jobRole.title ? jobRole.title : 'the role';
        fallback.improvements = fallback.improvements.map(i => i);
        if (!fallback.improvements.some(s => s.toLowerCase().includes(roleHint.toLowerCase()))) {
            fallback.improvements.push(`For ${roleHint}, focus on role-specific examples and technical depth.`);
        }

        // Add personalized note if user info available
        if (userInfo) {
            fallback.overall = `${userInfo.fullName}, thank you for completing the interview. ` + fallback.overall;
            if (userInfo.currentRole.toLowerCase().includes('student')) {
                fallback.recommendations.push('As a student, focus on building projects that showcase your learning from your degree program.');
            }
        }

        const ensured = this.ensureAllFields(fallback, conversationData, jobRole);
        return ensured;
    } catch (fallbackErr) {
        console.error('Fallback feedback generation failed:', fallbackErr);
        return {
            overall: 'Feedback unavailable at this time.',
            strengths: ['No strengths available'],
            improvements: ['No feedback available due to service error'],
            technical: '',
            communication: '',
            recommendations: [],
            scores: { communication: 5, technical: 5, problemSolving: 5, professionalism: 5 },
            evidence: [],
            confidence: 0
        };
    }
}

// Note: The rest of the GeminiService class methods remain the same
// (validateParsedFeedback, ensureAllFields, getMinimalParticipationFeedback, getDefaultFeedback, etc.)

    // Validate parsed JSON and coerce basic types
    validateParsedFeedback(parsed, conversationData, jobRole) {
        const defaultScores = { communication: 5, technical: 5, problemSolving: 5, professionalism: 5 };
        const parsedFeedback = {
            overall: (parsed && parsed.overall) ? String(parsed.overall).trim() : '',
            strengths: Array.isArray(parsed && parsed.strengths) ? parsed.strengths.map(String) : [],
            improvements: Array.isArray(parsed && parsed.improvements) ? parsed.improvements.map(String) : [],
            technical: (parsed && parsed.technical) ? String(parsed.technical).trim() : '',
            communication: (parsed && parsed.communication) ? String(parsed.communication).trim() : '',
            recommendations: Array.isArray(parsed && parsed.recommendations) ? parsed.recommendations.map(String) : [],
            scores: (parsed && parsed.scores && typeof parsed.scores === 'object') ? parsed.scores : defaultScores,
            evidence: Array.isArray(parsed && parsed.evidence) ? parsed.evidence : [],
            confidence: (parsed && typeof parsed.confidence === 'number') ? parsed.confidence : ((parsed && parsed.confidence) ? Number(parsed.confidence) : 0.5)
        };

        // Normalize numeric scores to valid 1..10 integers
        ['communication', 'technical', 'problemSolving', 'professionalism'].forEach(k => {
            let v = parsedFeedback.scores[k];
            v = Number(v);
            if (!Number.isFinite(v)) v = defaultScores[k];
            v = Math.round(v);
            if (v < 1) v = 1;
            if (v > 10) v = 10;
            parsedFeedback.scores[k] = v;
        });

        // Return both parsedFeedback and confidence for caller checks
        return { parsedFeedback, confidence: parsedFeedback.confidence || 0.5 };
    }

    // Ensure all fields are non-empty and provide role-aware defaults when necessary
    ensureAllFields(parsedFeedback, conversationData, jobRole) {
        const roleName = jobRole && jobRole.title ? jobRole.title : 'the role';
        const stats = (conversationData && conversationData.stats) ? conversationData.stats : {};

        // overall
        if (!parsedFeedback.overall || parsedFeedback.overall.trim().length === 0) {
            parsedFeedback.overall = `Feedback generated for ${roleName}. The candidate participated in a practice interview. Refer to detailed sections for specifics.`;
        }

        // strengths
        if (!Array.isArray(parsedFeedback.strengths) || parsedFeedback.strengths.length === 0) {
            const strengths = [];
            if ((stats.responseCount || 0) > 0) strengths.push('Provided at least one response during the session.');
            if ((stats.durationSeconds || 0) > 30) strengths.push('Allocated time for practice and engagement.');
            if ((stats.averageResponseLengthChars || 0) > 50) strengths.push('Responses were reasonably detailed.');
            if (strengths.length === 0) strengths.push('Attended the interview session.');
            parsedFeedback.strengths = strengths;
        }

        // improvements
        if (!Array.isArray(parsedFeedback.improvements) || parsedFeedback.improvements.length === 0) {
            parsedFeedback.improvements = [
                `Provide more role-specific examples relevant to ${roleName}.`,
                'Use the STAR structure (Situation, Task, Action, Result) to structure answers.',
                'Explain technical choices and trade-offs with concrete examples.'
            ];
        }

        // technical
        if (!parsedFeedback.technical || parsedFeedback.technical.trim().length === 0) {
            parsedFeedback.technical = `No detailed technical evaluation could be fully determined. For ${roleName}, focus on demonstrating concrete project experience, design decisions, and measurable outcomes.`;
        }

        // communication
        if (!parsedFeedback.communication || parsedFeedback.communication.trim().length === 0) {
            parsedFeedback.communication = 'Work on clear, structured answers; avoid very short replies and provide context and examples.';
        }

        // recommendations
        if (!Array.isArray(parsedFeedback.recommendations) || parsedFeedback.recommendations.length === 0) {
            parsedFeedback.recommendations = [
                'Prepare specific examples for common questions.',
                'Practice explaining technical decisions with trade-offs.',
                'Record and review answers to polish delivery and clarity.'
            ];
        }

        // evidence
        if (!Array.isArray(parsedFeedback.evidence) || parsedFeedback.evidence.length === 0) {
            const msgs = (conversationData && conversationData.messagesWindow) ? conversationData.messagesWindow : [];
            const evidence = [];
            const userMsgs = msgs.filter(m => m.role === 'user');
            if (userMsgs.length > 0) {
                const first = userMsgs[0];
                const last = userMsgs[userMsgs.length - 1];
                if (first) evidence.push({ msgIndex: first.index, excerpt: String(first.content || '').slice(0, 200), role: 'user' });
                if (last && last.index !== first.index) evidence.push({ msgIndex: last.index, excerpt: String(last.content || '').slice(0, 200), role: 'user' });
            }
            parsedFeedback.evidence = evidence;
        }

        // scores - ensure present and valid
        parsedFeedback.scores = parsedFeedback.scores || { communication: 5, technical: 5, problemSolving: 5, professionalism: 5 };
        ['communication', 'technical', 'problemSolving', 'professionalism'].forEach(k => {
            let v = Number(parsedFeedback.scores[k]);
            if (!Number.isFinite(v)) v = 5;
            v = Math.round(v);
            if (v < 1) v = 1;
            if (v > 10) v = 10;
            parsedFeedback.scores[k] = v;
        });

        // confidence
        if (parsedFeedback.confidence === undefined || typeof parsedFeedback.confidence !== 'number' || !Number.isFinite(parsedFeedback.confidence)) {
            parsedFeedback.confidence = 0.5;
        }

        return parsedFeedback;
    }

    // Get feedback for minimal participation (kept as fallback)
    getMinimalParticipationFeedback(participationRate, duration) {
        return {
            overall: `Unfortunately, this interview session had minimal participation. ${participationRate === 0 ? 'No responses were provided during the interview.' : 'Only very brief or minimal responses were given.'} To properly assess your interview skills, active participation with thoughtful, detailed responses is essential.`,
            strengths: [
                'Showed up for the interview practice session',
                participationRate > 0 ? 'Attempted to engage with the interviewer' : 'Allocated time for interview preparation'
            ].filter(Boolean),
            improvements: [
                'Provide complete, detailed responses to questions',
                'Engage actively throughout the entire interview',
                'Take time to think through answers before responding',
                'Share specific examples from your experience',
                'Ask clarifying questions when needed',
                'Demonstrate genuine interest and enthusiasm'
            ],
            technical: 'No technical knowledge could be assessed due to minimal participation. In a real interview, demonstrating your technical skills and knowledge is crucial. Practice articulating your experience and expertise clearly.',
            communication: 'Communication skills could not be properly evaluated due to lack of substantial responses. Effective communication is critical in interviews - practice expressing your thoughts clearly and comprehensively.',
            recommendations: [
                'Practice speaking about your experience for 1-2 minutes per question',
                'Prepare specific examples and stories from your background',
                'Record yourself answering common interview questions',
                'Focus on the STAR method (Situation, Task, Action, Result)',
                'Treat practice interviews as seriously as real ones'
            ],
            scores: {
                communication: participationRate === 0 ? 1 : 2,
                technical: participationRate === 0 ? 1 : 2,
                problemSolving: participationRate === 0 ? 1 : 2,
                professionalism: participationRate === 0 ? 2 : 3
            }
        };
    }

    // Get default feedback based on participation (kept as fallback)
    getDefaultFeedback(participationRate, avgResponseLength) {
        let baseScore = 5;
        
        if (participationRate === 0) {
            baseScore = 1;
        } else if (participationRate <= 2) {
            baseScore = 3;
        } else if (avgResponseLength < 20) {
            baseScore = 4;
        } else if (avgResponseLength < 50) {
            baseScore = 5;
        } else if (avgResponseLength < 100) {
            baseScore = 6;
        } else {
            baseScore = 7;
        }

        return {
            overall: participationRate <= 2 ? 
                'This interview had limited participation. To improve, focus on providing more detailed and thoughtful responses to each question.' :
                'Thank you for completing the interview. Your participation shows initiative in preparing for real interviews. Continue practicing to refine your skills.',
            strengths: participationRate > 2 ? [
                'Completed the full interview session',
                'Engaged with the interviewer throughout',
                'Provided responses to questions asked',
                'Demonstrated commitment to practice'
            ] : [
                'Showed up for the practice session',
                'Attempted to participate in the interview'
            ],
            improvements: [
                'Provide more detailed and comprehensive responses to questions',
                'Use specific examples from your experience to illustrate points',
                'Practice articulating your thoughts more clearly and confidently',
                'Take time to think through answers before responding',
                'Demonstrate more enthusiasm and engagement during responses'
            ],
            technical: participationRate <= 2 ?
                'Technical knowledge could not be adequately assessed due to limited responses. In real interviews, demonstrating your technical expertise is crucial for the role.' :
                'Continue practicing technical concepts and problem-solving approaches relevant to your target role. Work on explaining complex ideas in clear, accessible terms.',
            communication: participationRate <= 2 ?
                'Communication skills need significant improvement. Focus on giving fuller, more detailed responses that showcase your abilities and experience.' :
                'Work on developing clear and confident communication. Practice explaining your experience and qualifications in structured, comprehensive responses.',
            recommendations: [
                'Practice mock interviews regularly to build confidence and fluency',
                'Prepare specific examples from your experience using the STAR method',
                'Research common interview questions for your target role',
                'Focus on giving clear, structured responses with relevant details',
                'Record yourself answering questions to identify improvement areas'
            ],
            scores: {
                communication: baseScore,
                technical: baseScore,
                problemSolving: baseScore,
                professionalism: Math.min(baseScore + 1, 10)
            }
        };
    }

    // Get current model info
    getModelInfo() {
        return {
            currentModel: this.currentModel,
            requestCount: this.requestCount,
            failureCount: this.failureCount
        };
    }

    // Reset to primary model
    resetToPrimaryModel() {
        this.currentModel = CONFIG.PRIMARY_MODEL;
        this.failureCount = 0;
    }
}

// Create global instance
const geminiService = new GeminiService();

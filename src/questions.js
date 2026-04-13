'use strict';

const Config = require('./config');
const log    = require('./logger');

// ── AI generation ─────────────────────────────────────────────────────────────

const AI_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT =
  'You are a quiz question generator for students who are learning. ' +
  'Return ONLY a raw JSON array with no markdown fences or extra text. ' +
  'Each element: {"q":"question","options":["option1","option2","option3","option4"],"correct":0,"topic":"topic","explanation":"explanation"}. ' +
  '"correct" is the 0-based index of the correct option. Generate varied, clear questions. ' +
  'OPTION FORMAT RULES (CRITICAL): ' +
  '1. Each option must contain ONLY the answer text itself. ' +
  '2. NEVER prefix options with letters like "A)", "B)", "A.", "B.", "a)", "b)" or any label. The UI adds labels automatically. ' +
  '3. Good: ["Paris","London","Berlin","Rome"]. Bad: ["A) Paris","B) London","C) Berlin","D) Rome"]. ' +
  'CONTENT FALLBACK RULES: ' +
  '1. If the provided material is garbled, unreadable, corrupt, too short, or does not make sense, DO NOT refuse or return an error. ' +
  '2. Instead, identify the most likely TOPIC or SUBJECT from whatever clues are available (title, keywords, partial sentences). ' +
  '3. Then generate high-quality questions on that topic using your own knowledge. ' +
  '4. If absolutely no topic can be inferred, generate general knowledge questions and set topic to "General Knowledge". ' +
  'MATH FORMATTING RULES: ' +
  '1. Wrap ALL inline math expressions with \\( and \\), e.g. \\(x^2 + 1\\). ' +
  '2. Wrap display/block equations with \\[ and \\], e.g. \\[\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\]. ' +
  '3. Use LaTeX for ALL formulas in questions, options, AND explanations. Never use plain-text math like "x^2" — always use \\(x^2\\). ' +
  'EXPLANATION RULES: ' +
  '1. Every explanation MUST be understandable by a student learning the subject. ' +
  '2. For math questions: first state what the key symbols/terms mean, then show the solution steps, then state why the correct answer is right. ' +
  '3. Keep explanations concise but educational — a learner should understand the concept after reading it.';

/**
 * QuestionService — generates quiz questions from the DeepSeek AI API.
 * Throws an Error if generation fails for any reason; the caller is
 * responsible for aborting the game and notifying clients.
 */
const QuestionService = {
  /**
   * Return `count` questions using DeepSeek. Throws on any failure.
   *
   * @param {string} topicContext  Raw text pasted / uploaded by the host.
   * @param {number} count         Number of questions needed.
   * @returns {Promise<object[]>}
   */
  async generate(topicContext, count, difficulty = 'normal', language = 'English') {
    if (!Config.DEEPSEEK_API_KEY) {
      throw new Error('No API key configured — cannot generate questions.');
    }

    const contextChars = String(topicContext || '').slice(0, Config.LIMITS.AI_CONTEXT_CHARS);
    log.info('AI', `Requesting ${count} questions from DeepSeek (context: ${contextChars.length} chars, difficulty: ${difficulty}, language: ${language})`);

    // Connectivity ping before the expensive request
    const pingOk = await this._ping();
    if (!pingOk) throw new Error('DeepSeek API is unreachable. Check your connection or API key.');

    return this._fetchQuestions(contextChars, count, difficulty, language);
  },

  // ── Private ────────────────────────────────────────────────────────────────

  /** Send a cheap 1-token request to confirm the API is reachable. */
  async _ping() {
    try {
      log.debug('AI', 'Pinging DeepSeek API…');
      const res = await fetch(AI_URL, {
        method:  'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model:      'deepseek-chat',
          messages:   [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user',   content: 'Reply with the single word PONG.' },
          ],
          max_tokens:  Config.LIMITS.MAX_AI_TOKENS_PING,
          temperature: 0,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        log.error('AI', `Ping failed — HTTP ${res.status}: ${body.slice(0, 200)}`);
        return false;
      }

      log.debug('AI', 'Ping OK');
      return true;
    } catch (err) {
      log.error('AI', 'Ping exception:', err.message);
      return false;
    }
  },

  /** Send the full question-generation request to DeepSeek. */
  async _fetchQuestions(contextChars, count, difficulty = 'normal', language = 'English') {
    const difficultyClause =
      difficulty === 'easy' ? 'Make questions straightforward and beginner-friendly.' :
      difficulty === 'hard' ? 'Make questions challenging, requiring specific or advanced knowledge.' :
                              'Make questions moderately challenging.';

    const languageClause = `LANGUAGE REQUIREMENT (HIGHEST PRIORITY): You MUST generate ALL questions, options, and explanations in ${language}. This is non-negotiable.`;

    const userPrompt =
      `Generate ${count} multiple-choice quiz questions with 4 answer options ` +
      `based on this material:\n\n${contextChars}\n\n${difficultyClause}\n\n${languageClause}\n\n` +
      'CRITICAL FORMAT RULES:\n' +
      '1. Each option must be ONLY the answer text. NEVER add letter prefixes like "A)", "B.", etc. The app UI adds A/B/C/D automatically.\n' +
      '2. If the provided material is unreadable, garbled, or does not make sense, still generate questions — use your own knowledge about the topic you can infer from the material. Never refuse.\n' +
      '3. Use LaTeX notation (\\( \\) for inline, \\[ \\] for display) for ALL math expressions in questions, options, and explanations.\n' +
      '4. Each explanation must teach the concept — explain symbols, show steps, and state why the answer is correct.\n' +
      'Return ONLY a JSON array.';

    try {
      const res = await fetch(AI_URL, {
        method:  'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model:       'deepseek-chat',
          messages:    [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          max_tokens:  Config.LIMITS.AI_MAX_TOKENS,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        log.error('AI', `Request failed — HTTP ${res.status}: ${body.slice(0, 300)}`);
        throw new Error(`AI request failed (HTTP ${res.status}).`);
      }

      const data  = await res.json();
      let raw     = data.choices?.[0]?.message?.content || '';
      raw         = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      // Fix LaTeX backslashes that break JSON.parse():
      // After the outer API JSON is decoded, `raw` has literal backslashes
      // from LaTeX (\frac, \sqrt, \theta, etc.) that are invalid JSON escapes.
      // Strategy: protect the two structural JSON sequences (\\ and \"),
      //           then double every remaining backslash, then restore.
      raw = raw
        .replace(/\\\\/g, '\x00B\x00')    // protect existing \\
        .replace(/\\"/g,  '\x00Q\x00')    // protect existing \"
        .replace(/\\/g,   '\\\\')          // escape every remaining lone \
        .replace(/\x00B\x00/g, '\\\\')    // restore \\
        .replace(/\x00Q\x00/g, '\\"');     // restore \"

      const questions = JSON.parse(raw);

      if (!Array.isArray(questions) || questions.length === 0) {
        log.error('AI', 'Parsed response is not a valid array:', raw.slice(0, 200));
        throw new Error('AI returned an invalid response. Try again.');
      }

      // Validate and sanitize each question
      const validated = questions.filter((q, i) => {
        if (!q.q || !Array.isArray(q.options) || q.options.length < 2) {
          log.warn('AI', `Question ${i} missing required fields, skipping`);
          return false;
        }
        if (typeof q.correct !== 'number' || q.correct < 0 || q.correct >= q.options.length) {
          log.warn('AI', `Question ${i} has invalid correct index, skipping`);
          return false;
        }
        // Strip letter prefixes (e.g. "A) ", "B. ", "C: ") the AI may add despite instructions
        q.options = q.options.map(opt =>
          String(opt).replace(/^[A-Da-d][).:;\-]\s*/, '')
        );
        // Ensure explanation exists
        if (!q.explanation) {
          q.explanation = 'No explanation provided.';
        }
        return true;
      });

      if (validated.length === 0) {
        throw new Error('All AI-generated questions failed validation.');
      }

      log.info('AI', `Successfully generated ${validated.length} questions (${questions.length - validated.length} rejected)`);
      return validated.slice(0, count);
    } 
    catch (err) 
    {
      log.error('AI', 'Request exception:', err.message);
      throw err instanceof SyntaxError
        ? new Error('AI response could not be parsed. Try again.')
        : err;
    }
  },


  async generateOpen(topicContext, count, difficulty = 'normal', language = 'English') {
    if (!Config.DEEPSEEK_API_KEY) {
      throw new Error('No API key configured — cannot generate questions.');
    }

    const contextChars = String(topicContext || '').slice(0, Config.LIMITS.AI_CONTEXT_CHARS);
    log.info('AI', `Requesting ${count} OPEN questions from DeepSeek (language: ${language})`);

    const pingOk = await this._ping();
    if (!pingOk) throw new Error('DeepSeek API is unreachable.');

    return this._fetchOpenQuestions(contextChars, count, difficulty, language);
  },

  async _fetchOpenQuestions(contextChars, count, difficulty = 'normal', language = 'English') {
    const difficultyClause =
      difficulty === 'easy' ? 'Make questions straightforward and beginner-friendly.' :
      difficulty === 'hard' ? 'Make questions challenging, requiring specific knowledge.' :
                              'Make questions moderately challenging.';

    const languageClause = `LANGUAGE REQUIREMENT (HIGHEST PRIORITY): You MUST generate ALL questions, answers, and explanations in ${language}. This is non-negotiable.`;

    const userPrompt =
      `Generate ${count} open-ended quiz questions based on this material:\n\n${contextChars}\n\n${difficultyClause}\n\n${languageClause}\n\n` +
      'CRITICAL RULES:\n' +
      '1. If the provided material is unreadable, garbled, or does not make sense, still generate questions — use your own knowledge about the topic you can infer from the material. Never refuse.\n' +
      '2. The answer must be concise — a word, name, number, or short phrase. Not a full sentence.\n' +
      'Return ONLY a JSON array. Each element: {"q":"question","answer":"correct answer","topic":"topic","explanation":"explanation"}.';

    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a quiz question generator. Return ONLY a raw JSON array with no markdown fences or extra text. Each element: {"q":"question","answer":"correct answer","topic":"topic","explanation":"explanation"}. If the provided material is unreadable or garbled, infer the topic and generate questions using your own knowledge. Never refuse.' },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: Config.LIMITS.AI_MAX_TOKENS,
          temperature: 0.7,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`AI request failed (HTTP ${res.status}).`);
      }

      const data = await res.json();
      let raw = data.choices?.[0]?.message?.content || '';
      raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      // Fix LaTeX backslashes that break JSON.parse (same as _fetchQuestions)
      raw = raw
        .replace(/\\\\/g, '\x00B\x00')
        .replace(/\\"/g,  '\x00Q\x00')
        .replace(/\\/g,   '\\\\')
        .replace(/\x00B\x00/g, '\\\\')
        .replace(/\x00Q\x00/g, '\\"');

      const questions = JSON.parse(raw);

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('AI returned an invalid response.');
      }

      const validated = questions.filter((q, i) => {
        if (!q.q || !q.answer) {
          log.warn('AI', `Open question ${i} missing required fields, skipping`);
          return false;
        }
        if (!q.explanation) q.explanation = 'No explanation provided.';
        return true;
      });

      if (validated.length === 0) throw new Error('All open questions failed validation.');

      log.info('AI', `Generated ${validated.length} open questions`);
      return validated.slice(0, count);
    } catch (err) {
      log.error('AI', 'Open question generation failed:', err.message);
      throw err instanceof SyntaxError
        ? new Error('AI response could not be parsed. Try again.')
        : err;
    }
  },

  async gradeAnswer(question, correctAnswer, playerAnswer) {
    if (!Config.DEEPSEEK_API_KEY) return false;

    const prompt =
      `Question: "${question}"\n` +
      `Correct answer: "${correctAnswer}"\n` +
      `Player answered: "${playerAnswer}"\n\n` +
      'Reply with only "correct" or "wrong".\n' +
      'Mark as correct if the answer contains the key facts, regardless of case or minor spelling.\n' +
      'Mark as wrong if the answer is vague, indirect, or just describes the concept without naming it.';

    try {
      const res = await fetch(AI_URL, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a quiz answer grader. Reply with only "correct" or "wrong".' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      const data = await res.json();
      const verdict = data.choices?.[0]?.message?.content?.trim().toLowerCase();
      return verdict === 'correct';
    } catch (err) {
      log.error('AI', 'Grading failed:', err.message);
      return false;
    }
  },

  _headers() {
    return {
      Authorization:  `Bearer ${Config.DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    };
  },
};

module.exports = QuestionService;

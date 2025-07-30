"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callGemini = callGemini;
exports.callGroq = callGroq;
async function callGemini(prompt, apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });
        const data = await response.json();
        console.log('Gemini API response:', data);
        if (data.error) {
            return `Gemini API Error: ${data.error.message || JSON.stringify(data.error)}`;
        }
        return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response. This is an error.';
    }
    catch (err) {
        console.error('Gemini fetch error:', err);
        return `Gemini fetch error: ${err?.message || err}`;
    }
}
async function callGroq(prompt, apiKey) {
    const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: "deepseek-r1-distill-llama-70b",
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1024,
            }),
        });
        const data = await response.json();
        console.log('Groq API response:', data);
        if (data.error) {
            return `Groq API Error: ${data.error.message || JSON.stringify(data.error)}`;
        }
        if (data?.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
        }
        else {
            return 'No response. This is an error.';
        }
    }
    catch (err) {
        console.error('Groq fetch error:', err);
        return `Groq fetch error: ${err?.message || err}`;
    }
}

import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ 
      error: "GEMINI_API_KEY is not defined. Go to Vercel Settings -> Environment Variables and add GEMINI_API_KEY." 
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  try {
    const { message, history } = req.body;
    
    const contents = (history || []).map((msg: any) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "You are Gemini, an advanced AI integrated into the BABAVONDO messaging platform. You are helpful, concise, and professional."
    });

    const result = await model.generateContent({ contents });
    const responseText = result.response.text();

    return res.status(200).json({ text: responseText });
  } catch (error: any) {
    console.error("Gemini Vercel Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate AI content" });
  }
}

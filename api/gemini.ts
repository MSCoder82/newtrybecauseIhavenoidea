import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenerativeAI } from '@google/generative-ai'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in Vercel environment variables.')
    }

    const genAI = new GoogleGenerativeAI(apiKey)

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const prompt = req.body?.prompt || 'Say hello as a test.'
    const result = await model.generateContent(prompt)
    const response = result.response.text()

    res.status(200).json({ success: true, response })
  } catch (err: any) {
    console.error('Gemini API error:', err)
    res.status(500).json({ success: false, error: err.message })
  }
}
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  // 尝试从本地存储获取 Key，如果没有则使用环境变量（部署时通常不需要环境变量，依赖用户输入）
  const storedKey = localStorage.getItem('GEMINI_API_KEY');
  const apiKey = storedKey || process.env.API_KEY;
  
  if (!apiKey) {
    console.warn("API Key missing");
  }
  return new GoogleGenAI({ apiKey: apiKey || 'DEMO_KEY_MISSING' });
};

export const generateMetadata = async (fileNames: string[]): Promise<{ title: string; description: string }> => {
  try {
    const ai = getClient();
    
    const prompt = `
      我制作了一个短视频合集，使用了以下文件名的素材：
      ${fileNames.join(', ')}.
      
      请根据这些素材文件名，生成以下中文内容（JSON格式）：
      1. 一个吸引眼球的爆款短视频标题（title），60字以内，带有震惊或悬念感。
      2. 一个简短的视频简介（description），200字以内，包含3-5个热门Hashtag标签。
      
      请直接返回 JSON 对象，包含 "title" 和 "description" 字段。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      title: "标题生成失败",
      description: "请检查您的 API Key 设置或网络连接。"
    };
  }
};

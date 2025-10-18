

import React, { useState, useEffect } from 'react';
import { SparklesIcon } from './Icons';

const STEP_PROMPTS = {
  1: { title: "Step 1: Define the Issue", prompt: "Let's start with the basics. What is the core issue or project you need a communication plan for? Why is communication necessary right now?" },
  2: { title: "Step 2: Analyze the Situation", prompt: "Now, let's analyze the current situation. Briefly describe the background, any research you have, and a simple SWOT analysis (Strengths, Weaknesses, Opportunities, Threats). What mindset do you want to change?" },
  3: { title: "Step 3: Identify Audiences", prompt: "Who are your stakeholders and target audiences? List them out and consider their level of interest and influence." },
  4: { title: "Step 4: Define Goals & Objectives", prompt: "What are your communication goals? For each goal, define specific, measurable objectives. For example, 'Increase public awareness by 20% by December 31st.'" },
  5: { title: "Step 5: Develop Strategies & Messages", prompt: "How will you achieve your goals? Outline your main strategies, key tactics, and the core messages you want to convey. Include a few talking points for each message." },
  6: { title: "Step 6: Determine the Budget", prompt: "What resources are required? List potential budget items like advertising, materials, or event costs. A rough estimate is fine for now." },
  7: { title: "Step 7: Create an Action Matrix", prompt: "Let's make this actionable. Create a simple table or list of actions, who is responsible for each (owner), and a due date." },
  8: { title: "Step 8: Plan for Implementation", prompt: "How will you track implementation? Think about potential risks and how you might mitigate them." },
  9: { title: "Step 9: Establish Measurement", prompt: "How will you measure success? List the Key Performance Indicators (KPIs) you'll be tracking and how you'll collect that data." },
  10: { title: "Step 10: Plan for Post-Analysis", prompt: "Finally, how will you evaluate the plan's effectiveness after the campaign? What lessons do you hope to learn for the next cycle?" },
};

const RenderMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n').map(line => line.trim());
  return (
    <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none dark:prose-invert prose-h2:text-navy-900 prose-h3:text-navy-800 prose-p:text-navy-800 dark:prose-h2:text-white dark:prose-h3:text-navy-100 dark:prose-p:text-navy-200">
      {lines.map((line, index) => {
        if (line.startsWith('## ')) return <h2 key={index} className="text-2xl font-bold mt-6 mb-3 border-b pb-2 border-navy-200 dark:border-navy-700">{line.substring(3)}</h2>;
        if (line.startsWith('### ')) return <h3 key={index} className="text-xl font-semibold mt-4 mb-2">{line.substring(4)}</h3>;
        if (line.startsWith('* ')) return <li key={index} className="ml-6">{line.substring(2)}</li>;
        if (line.trim() === '') return null;

        const parts = line.split(/(\*\*.*?\*\*)/g).filter(part => part);
        return (
          <p key={index} className="my-2">
            {parts.map((part, i) =>
              part.startsWith('**') && part.endsWith('**') ? 
                <strong key={i}>{part.slice(2, -2)}</strong> : 
                part
            )}
          </p>
        );
      })}
    </div>
  );
};


const PlanBuilder: React.FC = () => {
    const [currentStep, setCurrentStep] = useState(0); // 0: intro, 1-10: steps, 11: generating, 12: complete
    const [planData, setPlanData] = useState<Record<number, string>>({});
    const [currentInput, setCurrentInput] = useState('');
    const [generatedPlan, setGeneratedPlan] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setCurrentInput(planData[currentStep] || '');
    }, [currentStep, planData]);

    const handleStart = () => setCurrentStep(1);

    const handleNext = () => {
        if (currentStep < 10) {
            setPlanData(prev => ({ ...prev, [currentStep]: currentInput }));
            setCurrentStep(prev => prev + 1);
        }
    };

    const handlePrevious = () => {
        if (currentStep > 1) {
            setPlanData(prev => ({ ...prev, [currentStep]: currentInput }));
            setCurrentStep(prev => prev - 1);
        }
    };
    
    const handleGeneratePlan = async () => {
        setIsLoading(true);
        const finalPlanData = { ...planData, [10]: currentInput };
        setPlanData(finalPlanData);

        const systemInstruction = `You are an expert communication strategist for the U.S. Army Corps of Engineers (USACE). Your task is to synthesize user-provided notes into a formal, comprehensive 10-step communication plan. The output should be a single, well-structured document using Markdown for formatting (headings, bold text, bullet points). Do not output JSON or any other code format. Adopt a professional and authoritative tone. Use '##' for main step headings (e.g., '## Step 1: Define the Issue') and '###' for subheadings. Use '*' for bullet points.`;
        
        let fullPrompt = "Please generate a complete communication plan based on the following inputs:\n\n";
        for (let i = 1; i <= 10; i++) {
            fullPrompt += `**${STEP_PROMPTS[i].title}:**\n${finalPlanData[i] || 'No input provided.'}\n\n`;
        }

        try {
            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: `${systemInstruction}\n\n${fullPrompt}` })
            });
            if (!res.ok) {
                throw new Error(`API error ${res.status}`);
            }
            const data = await res.json();
            setGeneratedPlan(data?.response ?? '');
            setCurrentStep(12);
        } catch(error) {
            console.error("Error generating plan:", error);
            setGeneratedPlan("Sorry, an error occurred while generating the plan. Please check your connection and API key, then try again.");
            setCurrentStep(12);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleStartOver = () => {
        setCurrentStep(0);
        setPlanData({});
        setCurrentInput('');
        setGeneratedPlan('');
    };

    const ProgressIndicator = () => (
        <div className="mb-6">
            <div className="flex justify-between mb-1">
                <span className="text-base font-medium text-usace-blue dark:text-navy-300">Step {currentStep} of 10</span>
                <span className="text-sm font-medium text-usace-blue dark:text-navy-300">{currentStep * 10}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-navy-700 rounded-full h-2.5">
                <div className="bg-usace-blue h-2.5 rounded-full" style={{ width: `${currentStep * 10}%` }}></div>
            </div>
        </div>
    );
    
    if (isLoading) {
        return (
            <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 h-full flex flex-col items-center justify-center">
                <h2 className="text-2xl font-bold text-navy-900 dark:text-white mb-4">Generating Your Plan...</h2>
                <p className="text-gray-600 dark:text-navy-300 mb-6">The AI is synthesizing your inputs into a professional document.</p>
                <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-usace-blue rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                    <div className="w-4 h-4 bg-usace-blue rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                    <div className="w-4 h-4 bg-usace-blue rounded-full animate-pulse"></div>
                </div>
            </div>
        )
    }

    if (currentStep === 12) {
        return (
             <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 h-full flex flex-col">
                <h2 className="text-3xl font-bold text-navy-900 dark:text-white mb-4">Your Communication Plan</h2>
                <div className="flex-1 overflow-y-auto mb-4 p-4 bg-navy-50 dark:bg-navy-900 rounded-md border border-navy-200 dark:border-navy-700">
                    <RenderMarkdown content={generatedPlan} />
                </div>
                <div className="flex justify-end space-x-4">
                    <button onClick={handleStartOver} className="inline-flex justify-center rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 py-2 px-4 text-sm font-medium text-gray-700 dark:text-navy-100 shadow-sm hover:bg-gray-50 dark:hover:bg-navy-600 focus:outline-none focus:ring-2 focus:ring-usace-red focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                        Start Over
                    </button>
                    <button onClick={() => navigator.clipboard.writeText(generatedPlan)} className="inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                        Copy to Clipboard
                    </button>
                </div>
            </div>
        )
    }

    if (currentStep >= 1) {
        return (
            <div className="bg-white dark:bg-navy-800 p-6 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 h-full flex flex-col">
                <ProgressIndicator />
                <div className="flex-1 flex flex-col">
                    <h3 className="text-2xl font-bold text-navy-900 dark:text-white mb-2">{STEP_PROMPTS[currentStep].title}</h3>
                    <p className="text-gray-600 dark:text-navy-300 mb-4">{STEP_PROMPTS[currentStep].prompt}</p>
                    <textarea 
                        value={currentInput}
                        onChange={(e) => setCurrentInput(e.target.value)}
                        className="flex-1 w-full p-2 border border-gray-300 dark:border-navy-600 rounded-md resize-none bg-white dark:bg-navy-700 text-gray-900 dark:text-white focus:ring-usace-blue focus:border-usace-blue"
                        placeholder="Your notes here..."
                    />
                </div>
                <div className="flex justify-between mt-6">
                    <button onClick={handlePrevious} disabled={currentStep <= 1} className="inline-flex justify-center rounded-md border border-gray-300 dark:border-navy-600 bg-white dark:bg-navy-700 py-2 px-4 text-sm font-medium text-gray-700 dark:text-navy-100 shadow-sm hover:bg-gray-50 dark:hover:bg-navy-600 disabled:bg-gray-100 disabled:dark:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                        Previous
                    </button>
                    {currentStep < 10 ? (
                        <button onClick={handleNext} className="inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                            Next Step
                        </button>
                    ) : (
                         <button onClick={handleGeneratePlan} className="inline-flex items-center justify-center rounded-md border border-transparent bg-usace-red py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-usace-red focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                            <SparklesIcon className="w-5 h-5 mr-2" />
                            Generate Plan
                        </button>
                    )}
                </div>
            </div>
        )
    }

    return (
         <div className="bg-white dark:bg-navy-800 p-8 rounded-lg shadow-md dark:shadow-2xl dark:shadow-navy-950/50 h-full flex flex-col items-center justify-center text-center">
            <SparklesIcon className="w-16 h-16 text-usace-blue mb-4" />
            <h2 className="text-3xl font-bold text-navy-900 dark:text-white mb-4">AI Communication Plan Builder</h2>
            <p className="max-w-xl text-gray-600 dark:text-navy-300 mb-8">
                Let's create a comprehensive, 10-step USACE communication plan. I'll guide you through each step. Just provide your notes and insights, and the AI will assemble a professional plan for you.
            </p>
            <button onClick={handleStart} className="inline-flex justify-center rounded-md border border-transparent bg-usace-blue py-3 px-6 text-base font-medium text-white shadow-sm hover:bg-navy-800 focus:outline-none focus:ring-2 focus:ring-usace-blue focus:ring-offset-2 dark:focus:ring-offset-navy-800 transition-colors">
                Let's Get Started
            </button>
        </div>
    );
};

export default PlanBuilder;

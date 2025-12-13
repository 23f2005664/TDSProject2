'use client';

import { useState } from 'react';

interface AnswerPanelProps {
    currentAnswer: any;
    isPaused: boolean;
    isRunning: boolean;
    onSubmit: (answer: any) => void;
}

export default function AnswerPanel({ currentAnswer, isPaused, isRunning, onSubmit }: AnswerPanelProps) {
    const [manualAnswer, setManualAnswer] = useState('');
    const [answerType, setAnswerType] = useState<'string' | 'number' | 'boolean' | 'json'>('string');

    const handleSubmit = () => {
        let parsedAnswer: any = manualAnswer;

        switch (answerType) {
            case 'number':
                parsedAnswer = parseFloat(manualAnswer);
                if (isNaN(parsedAnswer)) {
                    parsedAnswer = parseInt(manualAnswer);
                }
                break;
            case 'boolean':
                parsedAnswer = manualAnswer.toLowerCase() === 'true' || manualAnswer.toLowerCase() === 'yes';
                break;
            case 'json':
                try {
                    parsedAnswer = JSON.parse(manualAnswer);
                } catch {
                    alert('Invalid JSON format');
                    return;
                }
                break;
        }

        onSubmit(parsedAnswer);
        setManualAnswer('');
    };

    const formatAnswer = (answer: any) => {
        if (answer === null || answer === undefined) return 'null';
        if (typeof answer === 'object') return JSON.stringify(answer, null, 2);
        return String(answer);
    };

    return (
        <div className="glass-card h-[240px] flex flex-col">
            <div className="panel-header">
                <h3>
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    Answer Panel
                </h3>

                {isPaused && isRunning && (
                    <div className="badge badge-warning">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Manual Mode
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {isPaused && isRunning ? (
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <select
                                value={answerType}
                                onChange={(e) => setAnswerType(e.target.value as any)}
                                className="select-field w-28"
                            >
                                <option value="string">String</option>
                                <option value="number">Number</option>
                                <option value="boolean">Boolean</option>
                                <option value="json">JSON</option>
                            </select>

                            <input
                                type="text"
                                placeholder="Enter your answer..."
                                value={manualAnswer}
                                onChange={(e) => setManualAnswer(e.target.value)}
                                className="input-field flex-1"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSubmit();
                                }}
                            />

                            <button
                                onClick={handleSubmit}
                                disabled={!manualAnswer.trim()}
                                className="btn-primary whitespace-nowrap"
                            >
                                Submit
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Manual mode active. Enter your answer or resume AI.
                        </div>
                    </div>
                ) : currentAnswer !== null && currentAnswer !== undefined ? (
                    <div>
                        <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                            AI Generated Answer
                        </div>
                        <div className="code-block text-emerald-300">
                            {formatAnswer(currentAnswer)}
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/5 flex items-center justify-center">
                                <svg className="w-6 h-6 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-neutral-500 text-sm font-medium">No answer yet</p>
                            <p className="text-neutral-600 text-xs mt-1">Pause to enter manual mode</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

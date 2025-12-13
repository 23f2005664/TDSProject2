'use client';

interface QuizViewerProps {
    question: string | null;
    submitUrl: string | null;
    fileLinks: string[];
    isCorrect: boolean | null;
    reason: string | null;
}

export default function QuizViewer({ question, submitUrl, fileLinks, isCorrect, reason }: QuizViewerProps) {
    return (
        <div className="glass-card h-[420px] flex flex-col">
            <div className="panel-header">
                <h3>
                    <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    Current Question
                </h3>

                {isCorrect !== null && (
                    <div className={`badge ${isCorrect ? 'badge-success' : 'badge-error'}`}>
                        {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {question ? (
                    <div className="space-y-5">
                        <div className="text-[15px] text-neutral-200 leading-relaxed whitespace-pre-wrap">
                            {question}
                        </div>

                        {fileLinks.length > 0 && (
                            <div className="pt-4 border-t border-white/5">
                                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                                    Linked Files
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {fileLinks.map((link, i) => (
                                        <a
                                            key={i}
                                            href={link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            {link.split('/').pop() || 'File'}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {submitUrl && (
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                <span className="text-xs text-neutral-500">Submit endpoint:</span>
                                <p className="text-xs text-emerald-400 font-mono mt-1 break-all">{submitUrl}</p>
                            </div>
                        )}

                        {reason && !isCorrect && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                                <div className="flex items-start gap-3">
                                    <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <span className="text-sm text-red-300">{reason}</span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                <svg className="w-8 h-8 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <p className="text-neutral-500 font-medium">No question loaded</p>
                            <p className="text-neutral-600 text-sm mt-1">Start evaluation to begin</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

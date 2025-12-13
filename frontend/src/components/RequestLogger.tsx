'use client';

import { RefObject } from 'react';

interface LogEntry {
    timestamp: string;
    type: string;
    message: string;
    data?: any;
}

interface RequestLoggerProps {
    logs: LogEntry[];
    logsEndRef: RefObject<HTMLDivElement | null>;
}

const typeConfig: Record<string, { icon: string; color: string; bg: string }> = {
    success: { icon: '', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    error: { icon: '', color: 'text-red-400', bg: 'bg-red-500/10' },
    warning: { icon: '', color: 'text-amber-400', bg: 'bg-amber-500/10' },
    info: { icon: '', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    llm: { icon: '', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    question: { icon: '', color: 'text-pink-400', bg: 'bg-pink-500/10' },
    answer: { icon: '', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    submit: { icon: '', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    response: { icon: '', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    file: { icon: '', color: 'text-orange-400', bg: 'bg-orange-500/10' },
};

export default function RequestLogger({ logs, logsEndRef }: RequestLoggerProps) {
    const formatTimestamp = (ts: string) => {
        const date = new Date(ts);
        return date.toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div className="glass-card h-[680px] flex flex-col">
            <div className="panel-header">
                <h3>
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    Activity Log
                </h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-neutral-500 px-2 py-1 rounded-md bg-white/5">
                        {logs.length} entries
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-2">
                {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center">
                                <svg className="w-7 h-7 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <p className="text-neutral-500 font-medium">No activity yet</p>
                            <p className="text-neutral-600 text-sm mt-1">Logs will appear here</p>
                        </div>
                    </div>
                ) : (
                    logs.map((log, index) => {
                        const config = typeConfig[log.type] || { icon: '•', color: 'text-neutral-400', bg: 'bg-white/5' };

                        return (
                            <div key={index} className={`log-entry ${log.type}`}>
                                <div className="flex items-start gap-4">
                                    <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                                        <span className={`text-sm ${config.color}`}>{config.icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="text-[10px] font-mono text-neutral-600">
                                                {formatTimestamp(log.timestamp)}
                                            </span>
                                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                                                {log.type}
                                            </span>
                                        </div>
                                        <p className="text-sm text-neutral-200 break-words leading-relaxed">{log.message}</p>

                                        {log.data && (
                                            <details className="mt-3 group">
                                                <summary className="text-xs text-neutral-500 cursor-pointer hover:text-neutral-300 transition-colors flex items-center gap-2">
                                                    <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    View details
                                                </summary>
                                                <pre className="mt-3 code-block text-xs overflow-x-auto max-h-48">
                                                    {JSON.stringify(log.data, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={logsEndRef} />
            </div>
        </div>
    );
}

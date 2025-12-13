'use client';

interface ControlPanelProps {
    isRunning: boolean;
    isPaused: boolean;
    connected: boolean;
    onStart: () => void;
    onStop: () => void;
    onPause: () => void;
    onResume: () => void;
}

export default function ControlPanel({
    isRunning,
    isPaused,
    connected,
    onStart,
    onStop,
    onPause,
    onResume
}: ControlPanelProps) {
    return (
        <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
                {!isRunning ? (
                    <button
                        onClick={onStart}
                        disabled={!connected}
                        className="btn-primary"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Evaluation
                    </button>
                ) : (
                    <>
                        <button
                            onClick={onStop}
                            className="btn-danger"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                            </svg>
                            Stop
                        </button>

                        {!isPaused ? (
                            <button
                                onClick={onPause}
                                className="btn-warning"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Pause for Manual
                            </button>
                        ) : (
                            <button
                                onClick={onResume}
                                className="btn-primary"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Resume AI
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Status Indicators */}
            <div className="flex items-center gap-3">
                {isRunning && (
                    <div className={`badge ${isPaused ? 'badge-warning' : 'badge-success'}`}>
                        <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400'}`}>
                            {!isPaused && <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />}
                        </span>
                        {isPaused ? 'Manual Mode' : 'Running'}
                    </div>
                )}

                {!connected && (
                    <div className="badge badge-error">
                        <span className="w-2 h-2 rounded-full bg-red-400" />
                        Disconnected
                    </div>
                )}
            </div>
        </div>
    );
}

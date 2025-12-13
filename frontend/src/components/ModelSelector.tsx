'use client';

interface Model {
    id: string;
    name: string;
    provider: string;
    default?: boolean;
}

interface RateLimitInfo {
    limited: boolean;
    resetAt: number | null;
}

interface ModelSelectorProps {
    models: Model[];
    selectedModel: string;
    rateLimits: Record<string, RateLimitInfo>;
    onChange: (model: string) => void;
}

export default function ModelSelector({ models, selectedModel, rateLimits, onChange }: ModelSelectorProps) {
    const getModelStatus = (modelId: string) => {
        const limit = rateLimits[modelId];
        if (!limit?.limited) return null;
        if (limit.resetAt && Date.now() > limit.resetAt) return null;
        return 'rate-limited';
    };

    const selectedModelData = models.find(m => m.id === selectedModel);

    return (
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-xs font-medium text-neutral-400">Model</span>
            </div>

            <div className="relative">
                <select
                    value={selectedModel}
                    onChange={(e) => onChange(e.target.value)}
                    className="select-field min-w-[260px] pr-10"
                >
                    {models.map((model) => {
                        const status = getModelStatus(model.id);
                        return (
                            <option
                                key={model.id}
                                value={model.id}
                                disabled={status === 'rate-limited'}
                            >
                                {model.name} • {model.provider} {status === 'rate-limited' ? '⚠️' : ''} {model.default ? '★' : ''}
                            </option>
                        );
                    })}
                </select>

                {rateLimits[selectedModel]?.limited && (
                    <div className="absolute top-1/2 -translate-y-1/2 right-12 flex items-center gap-2">
                        <span className="text-xs text-amber-400 font-medium animate-pulse">Rate Limited</span>
                    </div>
                )}
            </div>
        </div>
    );
}

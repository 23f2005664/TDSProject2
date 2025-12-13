'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface LogEntry {
  timestamp: string;
  type: string;
  message: string;
  data?: any;
}

interface QuizState {
  question: string | null;
  submitUrl: string | null;
  fileLinks: string[];
  currentAnswer: any;
  isCorrect: boolean | null;
  reason: string | null;
}

interface DownloadedFile {
  filename: string;
  path: string;
  type: string;
  url: string;
}

export default function Home() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('google/gemini-2.0-flash-exp:free');

  const [email, setEmail] = useState('');
  const [secret, setSecret] = useState('');
  const [quizUrl, setQuizUrl] = useState('https://tds-llm-analysis.s-anand.net/project2');

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [manualAnswer, setManualAnswer] = useState('');

  const [quizState, setQuizState] = useState<QuizState>({
    question: null,
    submitUrl: null,
    fileLinks: [],
    currentAnswer: null,
    isCorrect: null,
    reason: null
  });

  const [requestJson, setRequestJson] = useState<any>(null);
  const [responseJson, setResponseJson] = useState<any>(null);
  const [editingPayload, setEditingPayload] = useState(false);
  const [payloadText, setPayloadText] = useState('');
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedFile[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const connect = () => {
      const socket = new WebSocket('ws://localhost:3001');
      socket.onopen = () => { setConnected(true); addLog('success', 'Connected to server'); };
      socket.onclose = () => { setConnected(false); setIsRunning(false); addLog('warning', 'Disconnected'); setTimeout(connect, 3000); };
      socket.onerror = () => addLog('error', 'Connection error');
      socket.onmessage = (e) => { try { handleServerMessage(JSON.parse(e.data)); } catch { } };
      setWs(socket);
    };
    connect();
    return () => ws?.close();
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((type: string, message: string, data?: any) => {
    setLogs(prev => [...prev, { timestamp: new Date().toISOString(), type, message, data }]);
  }, []);

  const handleServerMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'connected': setClientId(data.clientId); setModels(data.models || []); break;
      case 'started': setIsRunning(true); setDownloadedFiles([]); addLog('success', 'Started'); break;
      case 'stopped': setIsRunning(false); setIsPaused(false); addLog('info', 'Stopped'); break;
      case 'paused': setIsPaused(true); addLog('warning', 'Paused'); break;
      case 'resumed': setIsPaused(false); setEditingPayload(false); addLog('info', 'Resumed'); break;
      case 'log': addLog(data.log.type, data.log.message); break;
      case 'update': handleQuizUpdate(data.update); break;
      case 'complete': setIsRunning(false); addLog(data.result?.success ? 'success' : 'error', data.result?.success ? '🎉 Complete!' : `Error: ${data.result?.error}`); break;
      case 'error': addLog('error', data.message); break;
    }
  }, [addLog]);

  const handleQuizUpdate = useCallback((update: any) => {
    if (update.type === 'question_parsed') {
      setQuizState(prev => ({ ...prev, question: update.question, submitUrl: update.submitUrl, fileLinks: update.fileLinks || [], isCorrect: null, reason: null }));
    } else if (update.type === 'answer_ready') {
      setQuizState(prev => ({ ...prev, currentAnswer: update.answer }));
    } else if (update.type === 'response') {
      setQuizState(prev => ({ ...prev, isCorrect: update.result?.correct, reason: update.result?.reason }));
    } else if (update.type === 'request_json') {
      setRequestJson({ url: update.submitUrl, payload: update.payload });
    } else if (update.type === 'response_json') {
      setResponseJson({ status: update.status, data: update.response, isError: update.isError });
    } else if (update.type === 'file_downloaded') {
      setDownloadedFiles(prev => [...prev, update.file]);
    }
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }, [ws]);

  const handleStart = () => {
    if (!email || !quizUrl) return addLog('error', 'Email and URL required');
    setLogs([]);
    setRequestJson(null);
    setResponseJson(null);
    setDownloadedFiles([]);
    setQuizState({ question: null, submitUrl: null, fileLinks: [], currentAnswer: null, isCorrect: null, reason: null });
    sendMessage({ action: 'start', email, secret, url: quizUrl, model: selectedModel });
  };

  const handleSubmitManual = () => {
    if (!manualAnswer.trim()) return;
    let parsed: any = manualAnswer;
    try { parsed = JSON.parse(manualAnswer); } catch { }
    sendMessage({ action: 'submit_manual', answer: parsed });
    setManualAnswer('');
  };

  const handleEditPayload = () => {
    if (!requestJson) return;
    setPayloadText(JSON.stringify(requestJson.payload, null, 2));
    setEditingPayload(true);
    sendMessage({ action: 'pause' });
  };

  const handleSavePayload = () => {
    try {
      const edited = JSON.parse(payloadText);
      sendMessage({ action: 'edit_payload', payload: edited });
      setRequestJson({ ...requestJson, payload: edited });
    } catch (e) {
      alert('Invalid JSON format');
    }
  };

  const handleCancelEdit = () => {
    setEditingPayload(false);
    sendMessage({ action: 'resume' });
  };

  const openLocalFile = async (filePath: string) => {
    try {
      // Copy file path to clipboard (browsers block file:// protocol for security)
      await navigator.clipboard.writeText(filePath);
      alert(`File path copied to clipboard!\n\n${filePath}\n\nYou can open it in File Explorer or your editor.`);
    } catch (err) {
      // Fallback: show in console
      console.log('File path:', filePath);
      alert(`File path: ${filePath}\n\n(Could not copy to clipboard - check console)`);
    }
  };

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <header style={{ borderBottom: '1px solid #262626', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#14b8a6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontSize: '16px', fontWeight: 600 }}>LLM Quiz Solver</span>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: connected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: connected ? '#4ade80' : '#f87171' }}>
            {connected ? '● Connected' : '● Disconnected'}
          </span>
        </div>
        <select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); if (isRunning) sendMessage({ action: 'change_model', model: e.target.value }); }} style={{ padding: '10px 40px 10px 14px', backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px', cursor: 'pointer', minWidth: '280px' }}>
          {models.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
        </select>
      </header>

      <main style={{ padding: '24px 32px' }}>
        <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isRunning} style={{ width: '100%', padding: '10px 12px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px' }} placeholder="your@email.com" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Secret</label>
              <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} disabled={isRunning} style={{ width: '100%', padding: '10px 12px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px' }} placeholder="••••••" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 500, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Quiz URL</label>
              <input type="url" value={quizUrl} onChange={(e) => setQuizUrl(e.target.value)} disabled={isRunning} style={{ width: '100%', padding: '10px 12px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#fff', fontSize: '13px' }} placeholder="https://..." />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {!isRunning ? (
              <button onClick={handleStart} disabled={!connected} style={{ padding: '10px 20px', backgroundColor: '#14b8a6', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Start</button>
            ) : (
              <>
                <button onClick={() => sendMessage({ action: 'stop' })} style={{ padding: '10px 20px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Stop</button>
                {!isPaused ? (
                  <button onClick={() => sendMessage({ action: 'pause' })} style={{ padding: '10px 20px', backgroundColor: '#f59e0b', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Pause</button>
                ) : (
                  <button onClick={() => sendMessage({ action: 'resume' })} style={{ padding: '10px 20px', backgroundColor: '#14b8a6', color: '#000', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>Resume</button>
                )}
              </>
            )}
            {isRunning && <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, backgroundColor: isPaused ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: isPaused ? '#fbbf24' : '#4ade80' }}>
              {isPaused ? '⏸ Paused' : '● Running'}
            </span>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '20px' }}>
          {/* Left - Question & Answer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>❓ Question</div>
                {quizState.isCorrect !== null && <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 500, backgroundColor: quizState.isCorrect ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: quizState.isCorrect ? '#4ade80' : '#f87171' }}>{quizState.isCorrect ? '✓' : '✗'}</span>}
              </div>
              <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
                {quizState.question ? <p style={{ fontSize: '13px', color: '#a1a1aa', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{quizState.question}</p> : <p style={{ fontSize: '13px', color: '#525252', margin: 0 }}>No question</p>}
                {quizState.reason && !quizState.isCorrect && <div style={{ marginTop: '10px', padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}><p style={{ fontSize: '11px', color: '#f87171', margin: 0 }}>💡 {quizState.reason}</p></div>}
              </div>
            </div>

            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', fontSize: '12px', fontWeight: 600 }}>✓ Answer</div>
              <div style={{ padding: '14px' }}>
                {isPaused && isRunning ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={manualAnswer} onChange={(e) => setManualAnswer(e.target.value)} placeholder="Manual answer..." onKeyDown={(e) => e.key === 'Enter' && handleSubmitManual()} style={{ flex: 1, padding: '8px 10px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', color: '#fff', fontSize: '12px' }} />
                    <button onClick={handleSubmitManual} style={{ padding: '8px 16px', backgroundColor: '#14b8a6', color: '#000', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>Submit</button>
                  </div>
                ) : quizState.currentAnswer !== null ? (
                  <pre style={{ padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', fontSize: '11px', color: '#14b8a6', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0, maxHeight: '150px' }}>
                    {typeof quizState.currentAnswer === 'object' ? JSON.stringify(quizState.currentAnswer, null, 2) : String(quizState.currentAnswer)}
                  </pre>
                ) : (
                  <p style={{ fontSize: '12px', color: '#525252', margin: 0 }}>Waiting...</p>
                )}
              </div>
            </div>

            {downloadedFiles.length > 0 && (
              <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', fontSize: '12px', fontWeight: 600 }}>📁 Downloaded Files</div>
                <div style={{ padding: '10px', maxHeight: '200px', overflowY: 'auto' }}>
                  {downloadedFiles.map((file, i) => (
                    <div key={i} onClick={() => openLocalFile(file.path)} style={{ padding: '8px 10px', marginBottom: '6px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = '#14b8a6'} onMouseLeave={(e) => e.currentTarget.style.borderColor = '#262626'}>
                      <span style={{ fontSize: '14px' }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', color: '#fff', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.filename}</div>
                        <div style={{ fontSize: '10px', color: '#737373' }}>{file.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Middle - JSON */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>📤 Request</div>
                {requestJson && !editingPayload && <button onClick={handleEditPayload} style={{ padding: '3px 10px', backgroundColor: '#262626', color: '#14b8a6', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: 500, cursor: 'pointer' }}>Edit</button>}
              </div>
              <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
                {editingPayload ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
                    <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={{ flex: 1, padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', color: '#14b8a6', fontSize: '11px', fontFamily: 'monospace', resize: 'none', minHeight: '200px' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleSavePayload} style={{ flex: 1, padding: '8px', backgroundColor: '#14b8a6', color: '#000', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>Save & Resume</button>
                      <button onClick={handleCancelEdit} style={{ flex: 1, padding: '8px', backgroundColor: '#262626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : requestJson ? (
                  <div>
                    <div style={{ fontSize: '10px', color: '#737373', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {requestJson.url}</div>
                    <pre style={{ padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', fontSize: '10px', color: '#06b6d4', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
                      {JSON.stringify(requestJson.payload, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: '#525252', margin: 0 }}>No request</p>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                Response
                {responseJson && <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '20px', backgroundColor: responseJson.isError ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)', color: responseJson.isError ? '#f87171' : '#4ade80' }}>{responseJson.status}</span>}
              </div>
              <div style={{ padding: '14px', flex: 1, overflowY: 'auto' }}>
                {responseJson ? (
                  <pre style={{ padding: '10px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '6px', fontSize: '10px', color: responseJson.isError ? '#f87171' : '#8b5cf6', overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
                    {JSON.stringify(responseJson.data, null, 2)}
                  </pre>
                ) : (
                  <p style={{ fontSize: '12px', color: '#525252', margin: 0 }}>No response</p>
                )}
              </div>
            </div>
          </div>

          {/* Right - Logs */}
          <div style={{ backgroundColor: '#171717', border: '1px solid #262626', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '580px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #262626', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>📋 Activity Log</div>
              <span style={{ fontSize: '10px', color: '#525252' }}>{logs.length}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {logs.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#525252', textAlign: 'center', padding: '20px 0', margin: 0 }}>No activity</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} style={{ padding: '6px 10px', borderRadius: '6px', marginBottom: '5px', backgroundColor: '#0a0a0a', borderLeft: `2px solid ${log.type === 'success' ? '#22c55e' : log.type === 'error' ? '#ef4444' : log.type === 'warning' ? '#f59e0b' : log.type === 'llm' ? '#a855f7' : log.type === 'question' ? '#ec4899' : log.type === 'answer' ? '#14b8a6' : '#3b82f6'}`, fontFamily: 'monospace', fontSize: '10px' }}>
                    <span style={{ color: '#525252', marginRight: '8px' }}>{formatTime(log.timestamp)}</span>
                    <span style={{ color: '#e5e5e5' }}>{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

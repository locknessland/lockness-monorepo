import { collector } from '../collector.ts'
import type { RequestInfo } from '../types.ts'
import { icons } from './icons.ts'
import { LogoButton } from './logo-button.tsx'
import { Metrics } from './metrics.tsx'
import { RequestInfoItem } from './request-info.tsx'

interface DebugToolbarProps {
    requestId?: string
}

export function DebugToolbar({ requestId }: DebugToolbarProps) {
    const data = collector.getAllData()
    const currentRequest = requestId
        ? data.requests.find((r: RequestInfo) => r.id === requestId)
        : data.requests[data.requests.length - 1]

    const statusCode = currentRequest?.statusCode

    const styles = `
    #lockness-debug-toolbar {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 64px;
        background-color: #0f1115;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 -4px 20px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        color: #e5e7eb;
    }
    
    .ln-container {
        max-width: 1600px;
        margin: 0 auto;
        height: 100%;
        padding: 0 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
    }

    /* Left Section */
    .ln-brand {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .ln-logo-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: rgba(99, 102, 241, 0.1);
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 8px;
        color: #818cf8;
        transition: all 0.2s;
    }
    .ln-logo-btn:hover {
        background: rgba(99, 102, 241, 0.2);
        transform: scale(1.05);
    }
    .ln-logo-icon { width: 18px; height: 18px; }

    .ln-status-badge {
        display: flex;
        align-items: center;
        height: 32px;
        padding: 0 12px;
        border-radius: 6px;
        font-weight: 700;
        font-size: 13px;
        color: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        box-sizing: border-box;
    }

    .ln-divider {
        width: 1px;
        height: 24px;
        background-color: rgba(255, 255, 255, 0.1);
    }

    .ln-request-info {
        display: flex;
        align-items: center;
        padding: 0 10px;
        background: rgba(30, 27, 75, 0.5); /* indigo-950/50 */
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: 6px;
        font-size: 13px;
        height: 32px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        transition: all 0.2s;
    }
    
    .ln-request-info:hover {
        background: rgba(30, 27, 75, 0.8);
        border-color: rgba(99, 102, 241, 0.3);
    }

    .ln-method { 
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-weight: 700;
        color: #818cf8; /* indigo-400 */
        margin-right: 10px;
        padding-right: 10px;
        border-right: 1px solid rgba(255, 255, 255, 0.1);
        line-height: 1;
        letter-spacing: 0.05em;
    }

    .ln-action { 
        color: #c7d2fe; /* indigo-200 */
        font-weight: 500;
        white-space: nowrap;
        display: flex;
        align-items: center;
    }

    /* Items styles */
    .ln-metrics-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .ln-link { text-decoration: none; }

    .ln-toolbar-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0); 
        border: 1px solid transparent;
        transition: all 0.2s;
        cursor: pointer;
        position: relative;
    }

    .ln-toolbar-item:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.05);
    }

    .ln-icon { width: 18px; height: 18px; flex-shrink: 0; }
    
    .ln-content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        line-height: 1;
    }

    .ln-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #94a3b8; /* slate-400 */
        font-weight: 600;
        margin-top: 2px;
    }

    .ln-value {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
    }

    .ln-badge {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #ef4444;
        box-shadow: 0 0 0 2px #0f1115;
    }

    /* Close Button */
    .ln-close-btn {
        background: transparent;
        border: none;
        color: #6b7280;
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
    }
    .ln-close-btn:hover { background: rgba(255,255,255,0.05); color: #e5e7eb; }

    /* Responsive / Menu Styles */
    .ln-menu-trigger {
        display: none;
        background: transparent;
        border: none;
        color: #9ca3af;
        padding: 8px;
        border-radius: 6px;
        cursor: pointer;
    }
    .ln-menu-trigger:hover { color: white; background: rgba(255,255,255,0.05); }

    .ln-dropdown {
        display: none;
        position: absolute;
        bottom: 70px;
        right: 20px;
        background: #181a20;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 8px;
        min-width: 200px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        flex-direction: column;
        gap: 4px;
    }
    
    .ln-dropdown.open { display: flex; animation: slideUp 0.1s ease-out; }

    @keyframes slideUp {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .ln-dropdown .ln-toolbar-item {
        padding: 10px 12px;
        width: 100%;
        box-sizing: border-box;
    }

    .ln-dropdown .ln-content {
         flex-direction: row-reverse;
         justify-content: space-between;
         width: 100%;
         align-items: center;
    }
    
    .ln-dropdown .ln-value {
        font-size: 13px;
    }

    /* Media Queries */
    @media (max-width: 1100px) {
        .ln-metrics-secondary { display: none !important; }
        .ln-menu-trigger { display: block; }
    }
    
    @media (max-width: 768px) {
        .ln-metrics-row { display: none; }
        .ln-request-info { display: none; }
        .ln-menu-trigger { display: block; }
    }
    `

    // Script to toggle the menu (using vanilla JS injected into onclick attribute)
    const toggleScript =
        `const m=document.getElementById('ln-mobile-menu');if(m.style.display==='flex'){m.style.display='none';m.classList.remove('open')}else{m.style.display='flex';m.classList.add('open')}`

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: styles }} />
            <nav id='lockness-debug-toolbar'>
                <div className='ln-container'>
                    {/* Left: Brand & Context */}
                    <div className='ln-brand'>
                        <LogoButton />

                        {currentRequest?.controller && (
                            <RequestInfoItem
                                method={currentRequest.method}
                                statusCode={statusCode}
                                controller={currentRequest.controller}
                                action={currentRequest.action}
                                component={currentRequest.component}
                            />
                        )}
                    </div>

                    {/* Center: Metrics (Desktop) */}
                    <div className='ln-metrics-row'>
                        <Metrics
                            data={data}
                            currentRequest={currentRequest}
                            mobile={false}
                        />
                    </div>

                    {/* Right: Controls & Mobile Trigger */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type='button'
                            className='ln-menu-trigger'
                            onclick={toggleScript}
                        >
                            <div
                                style={{ width: '20px', height: '20px' }}
                                dangerouslySetInnerHTML={{ __html: icons.menu }}
                            />
                        </button>
                        <button
                            type='button'
                            className='ln-close-btn'
                            onclick="document.getElementById('lockness-debug-toolbar').style.display='none'"
                        >
                            <div
                                style={{ width: '20px', height: '20px' }}
                                dangerouslySetInnerHTML={{
                                    __html: icons.close,
                                }}
                            />
                        </button>
                    </div>
                </div>

                {/* Mobile Dropdown Menu (Hidden by default) */}
                <div id='ln-mobile-menu' className='ln-dropdown'>
                    <Metrics
                        data={data}
                        currentRequest={currentRequest}
                        mobile
                    />
                </div>
            </nav>
        </>
    )
}

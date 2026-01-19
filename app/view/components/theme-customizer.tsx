import {
    Button,
    Card,
    CardContent,
    Input,
    Label,
} from '@lockness/ui/components'

/**
 * Theme Customizer Component
 * Allows users to customize theme CSS variables on the fly
 */
export const ThemeCustomizer = () => {
    const customizerId = 'theme-customizer-panel'

    return (
        <>
            {/* Trigger Button */}
            <button
                type='button'
                class='w-full flex items-center gap-2 px-2 py-2 text-xs text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors'
                onclick={`document.getElementById('${customizerId}').classList.toggle('hidden')`}
            >
                <svg
                    class='size-4'
                    xmlns='http://www.w3.org/2000/svg'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='2'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                >
                    <path d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' />
                    <circle cx='12' cy='12' r='3' />
                </svg>
                Customize Theme
            </button>

            {/* Customizer Panel */}
            <div
                id={customizerId}
                class='hidden fixed bottom-4 left-4 z-[100] w-80 max-h-[80vh] overflow-y-auto'
            >
                <Card class='shadow-xl border-2'>
                    <CardContent class='p-4 space-y-4'>
                        <div class='flex items-center justify-between'>
                            <h3 class='font-pixel text-sm'>Theme Customizer</h3>
                            <button
                                type='button'
                                class='p-1 hover:bg-muted rounded'
                                onclick={`document.getElementById('${customizerId}').classList.add('hidden')`}
                            >
                                <svg
                                    class='size-4'
                                    xmlns='http://www.w3.org/2000/svg'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    stroke-width='2'
                                >
                                    <path d='M18 6 6 18' />
                                    <path d='m6 6 12 12' />
                                </svg>
                            </button>
                        </div>

                        {/* Primary Color */}
                        <div class='space-y-2'>
                            <Label for='primary-color'>Primary Color</Label>
                            <div class='flex gap-2'>
                                <input
                                    type='color'
                                    id='primary-color'
                                    class='h-10 w-14 rounded border border-input cursor-pointer'
                                    onchange="window.updateThemeVar('--primary', this.value)"
                                />
                                <Input
                                    type='text'
                                    id='primary-color-text'
                                    placeholder='#000000'
                                    class='flex-1'
                                    onchange="window.updateThemeVar('--primary', this.value)"
                                />
                            </div>
                        </div>

                        {/* Destructive Color */}
                        <div class='space-y-2'>
                            <Label for='destructive-color'>
                                Destructive Color
                            </Label>
                            <div class='flex gap-2'>
                                <input
                                    type='color'
                                    id='destructive-color'
                                    defaultValue='#ef4444'
                                    class='h-10 w-14 rounded border border-input cursor-pointer'
                                    onchange="window.updateThemeVar('--destructive', this.value)"
                                />
                                <Input
                                    type='text'
                                    placeholder='#ef4444'
                                    class='flex-1'
                                    onchange="window.updateThemeVar('--destructive', this.value)"
                                />
                            </div>
                        </div>

                        {/* Border Radius */}
                        <div class='space-y-2'>
                            <Label for='border-radius'>
                                Border Radius:{' '}
                                <span id='radius-value'>0.625rem</span>
                            </Label>
                            <input
                                type='range'
                                id='border-radius'
                                min='0'
                                max='2'
                                step='0.125'
                                defaultValue='0.625'
                                class='w-full accent-primary'
                                oninput='window.updateRadius(this.value)'
                            />
                            <div class='flex justify-between text-xs text-muted-foreground'>
                                <span>0</span>
                                <span>1rem</span>
                                <span>2rem</span>
                            </div>
                        </div>

                        {/* Preview */}
                        <div class='space-y-2'>
                            <Label>Preview</Label>
                            <div class='flex gap-2'>
                                <Button size='sm'>Primary</Button>
                                <Button size='sm' variant='secondary'>
                                    Secondary
                                </Button>
                                <Button size='sm' variant='danger'>
                                    Delete
                                </Button>
                            </div>
                            <div class='p-3 bg-card border border-border rounded-(--radius)'>
                                <p class='text-sm text-muted-foreground'>
                                    Card with custom radius
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div class='flex gap-2 pt-2 border-t border-border'>
                            <Button
                                size='sm'
                                variant='outline'
                                class='flex-1'
                                onclick='window.resetTheme()'
                            >
                                Reset
                            </Button>
                            <Button
                                size='sm'
                                class='flex-1'
                                onclick='window.saveTheme()'
                            >
                                Save
                            </Button>
                        </div>

                        <p class='text-xs text-muted-foreground'>
                            Changes are saved to localStorage
                        </p>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}

/**
 * Theme Customizer Script
 * Provides JavaScript functions for theme customization
 */
export const ThemeCustomizerScript = () => {
    const script = `
    (function() {
        // Convert hex to OKLCH (simplified - uses approximation)
        function hexToOklch(hex) {
            // Remove # if present
            hex = hex.replace('#', '');
            
            // Parse RGB
            const r = parseInt(hex.substr(0, 2), 16) / 255;
            const g = parseInt(hex.substr(2, 2), 16) / 255;
            const b = parseInt(hex.substr(4, 2), 16) / 255;
            
            // Convert to linear RGB
            const toLinear = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            const lr = toLinear(r);
            const lg = toLinear(g);
            const lb = toLinear(b);
            
            // RGB to XYZ
            const x = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
            const y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
            const z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;
            
            // XYZ to Lab (simplified)
            const l = 0.2104542553 * x + 0.7936177850 * y - 0.0040720468 * z;
            const m = 1.9779984951 * x - 2.4285922050 * y + 0.4505937099 * z;
            const s = 0.0259040371 * x + 0.7827717662 * y - 0.8086757660 * z;
            
            const l_ = Math.cbrt(l);
            const m_ = Math.cbrt(m);
            const s_ = Math.cbrt(s);
            
            const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
            const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
            const b2 = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
            
            const C = Math.sqrt(a * a + b2 * b2);
            let H = Math.atan2(b2, a) * 180 / Math.PI;
            if (H < 0) H += 360;
            
            return 'oklch(' + L.toFixed(3) + ' ' + C.toFixed(3) + ' ' + H.toFixed(3) + ')';
        }
        
        // Update a CSS variable
        window.updateThemeVar = function(varName, value) {
            // If it's a hex color, convert to OKLCH
            if (value.startsWith('#')) {
                value = hexToOklch(value);
            }
            document.documentElement.style.setProperty(varName, value);
            
            // Store in pending changes
            if (!window._themeChanges) window._themeChanges = {};
            window._themeChanges[varName] = value;
        };
        
        // Update radius
        window.updateRadius = function(value) {
            const rem = value + 'rem';
            document.documentElement.style.setProperty('--radius', rem);
            document.getElementById('radius-value').textContent = rem;
            
            if (!window._themeChanges) window._themeChanges = {};
            window._themeChanges['--radius'] = rem;
        };
        
        // Reset theme to defaults
        window.resetTheme = function() {
            const vars = ['--primary', '--primary-foreground', '--destructive', '--radius'];
            vars.forEach(v => document.documentElement.style.removeProperty(v));
            localStorage.removeItem('lockness-theme');
            window._themeChanges = {};
            
            // Reset form values
            document.getElementById('border-radius').value = 0.625;
            document.getElementById('radius-value').textContent = '0.625rem';
        };
        
        // Save theme to localStorage
        window.saveTheme = function() {
            if (window._themeChanges) {
                localStorage.setItem('lockness-theme', JSON.stringify(window._themeChanges));
            }
        };
        
        // Load saved theme on page load
        function loadSavedTheme() {
            const saved = localStorage.getItem('lockness-theme');
            if (saved) {
                try {
                    const theme = JSON.parse(saved);
                    Object.entries(theme).forEach(([key, value]) => {
                        document.documentElement.style.setProperty(key, value);
                    });
                    window._themeChanges = theme;
                    
                    // Update radius slider if saved
                    if (theme['--radius']) {
                        const radiusVal = parseFloat(theme['--radius']);
                        const slider = document.getElementById('border-radius');
                        const display = document.getElementById('radius-value');
                        if (slider) slider.value = radiusVal;
                        if (display) display.textContent = theme['--radius'];
                    }
                } catch (e) {
                    console.error('Failed to load theme:', e);
                }
            }
        }
        
        // Load theme when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', loadSavedTheme);
        } else {
            loadSavedTheme();
        }
    })();
    `

    return <script dangerouslySetInnerHTML={{ __html: script }} />
}

import { Child } from 'hono/jsx'

export const Button = ({ children, variant = 'primary', ...props }: { children: Child, variant?: 'primary' | 'secondary' | 'outline' } & any) => {
    const baseStyles = 'px-6 py-3 rounded-xl font-bold transition-all active:scale-95 text-center inline-block cursor-pointer'
    
    const variants = {
        primary: 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:opacity-90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border hover:bg-accent hover:text-accent-foreground'
    }

    return (
        <button class={`${baseStyles} ${variants[variant]}`} {...props}>
            {children}
        </button>
    )
}

export const Card = ({ children, title, description, class: className = '' }: { children: Child, title?: string, description?: string, class?: string }) => {
    return (
        <div class={`bg-card border border-border rounded-3xl p-8 shadow-sm hover:border-primary/50 transition-colors group ${className}`}>
            {title && <h3 class="text-2xl font-bold mb-2 text-card-foreground">{title}</h3>}
            {description && <p class="text-muted-foreground mb-6 leading-relaxed">{description}</p>}
            {children}
        </div>
    )
}

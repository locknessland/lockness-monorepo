import { icons } from './icons.ts'

export function LogoButton() {
    return (
        <a href='/_devtools' className='ln-logo-btn'>
            <div
                className='ln-logo-icon'
                dangerouslySetInnerHTML={{
                    __html: icons.wrench,
                }}
            />
        </a>
    )
}

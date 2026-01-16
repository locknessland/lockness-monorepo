import { colors } from '../theme.ts'

export const Separator = () => {
    const styles = {
        height: '24px',
        width: '1px',
        backgroundColor: colors.border.default,
        margin: '0 8px',
    }

    const mobileHideStyle = `
        @media (max-width: 768px) {
            display: none;
        }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: mobileHideStyle }} />
            <div style={styles as any} class='separator-line' />
        </>
    )
}

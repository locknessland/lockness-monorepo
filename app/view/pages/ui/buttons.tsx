import { Button } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const ButtonsPage = () => {
    return (
        <PageUiLayout title='Buttons - Lockness UI' currentPath='/ui/buttons'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        BUTTONS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Flexible button component with multiple variants and
                        sizes
                    </p>
                </header>

                {/* Button Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>VARIANTS</h2>
                    <div class='flex flex-wrap gap-4 items-center py-6 bg-card rounded-lg'>
                        <Button variant='primary'>Primary</Button>
                        <Button variant='secondary'>Secondary</Button>
                        <Button variant='outline'>Outline</Button>
                        <Button variant='ghost'>Ghost</Button>
                        <Button variant='danger'>Danger</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                </section>

                {/* Button Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>SIZES</h2>
                    <div class='flex flex-wrap gap-4 items-center py-6 bg-card rounded-lg'>
                        <Button size='xl' variant='primary'>
                            Extra Large
                        </Button>
                        <Button size='lg' variant='primary'>
                            Large
                        </Button>
                        <Button size='md' variant='primary'>
                            Medium
                        </Button>
                        <Button size='sm' variant='primary'>
                            Small
                        </Button>
                    </div>
                </section>

                {/* Unpoly Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        UNPOLY PROPS
                    </h2>
                    <p class='text-muted-foreground text-sm mb-4'>
                        Props pour configurer le comportement Unpoly des liens.
                    </p>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Prop
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Type
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>href</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Rend en anchor avec{' '}
                                        <code>up-follow</code> automatique
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>preload</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>boolean</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Précharge la page au hover
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>target</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>UnpolyTarget</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Sélecteur CSS à mettre à jour
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>transition</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>UnpolyTransition</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Animation de transition
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>duration</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>number</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Durée de la transition en ms
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>easing</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>UnpolyEasing</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Fonction de timing CSS
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>failTransition</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>UnpolyTransition</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Transition en cas d'erreur serveur
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Transitions Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TRANSITIONS DISPONIBLES
                    </h2>
                    <p class='text-muted-foreground text-sm mb-4'>
                        Transitions prédéfinies pour la prop{' '}
                        <code>transition</code>.
                    </p>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Valeur
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Description
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Exemple
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>cross-fade</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Fondu simultané ancien/nouveau
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='cross-fade'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>move-left</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Glisse vers la gauche (navigation avant)
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='move-left'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>move-right</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Glisse vers la droite (navigation
                                        arrière)
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='move-right'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>move-up</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Glisse vers le haut
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='move-up'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>move-down</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Glisse vers le bas
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='move-down'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>none</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Pas d'animation
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`transition='none'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>anim1/anim2</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Combine deux animations
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>
                                            {`transition='move-to-left/fade-in'`}
                                        </code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Target Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TARGETS DISPONIBLES
                    </h2>
                    <p class='text-muted-foreground text-sm mb-4'>
                        Sélecteurs spéciaux pour la prop <code>target</code>.
                    </p>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Valeur
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Description
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Exemple
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>:main</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Zone principale (main, [up-main])
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target=':main'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>:layer</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Layer courante (modal, popup)
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target=':layer'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>:origin</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Élément qui a déclenché l'action
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target=':origin'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>:none</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Aucun élément (request seulement)
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target=':none'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>.class</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Sélecteur CSS personnalisé
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target='.content'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>#id</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Sélecteur par ID
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`target='#sidebar'`}</code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Easing Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        EASING DISPONIBLES
                    </h2>
                    <p class='text-muted-foreground text-sm mb-4'>
                        Fonctions de timing pour la prop <code>easing</code>.
                    </p>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Valeur
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Description
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Exemple
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>linear</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Vitesse constante
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`easing='linear'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>ease</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Accélère puis ralentit (défaut)
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`easing='ease'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>ease-in</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Démarre lentement
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`easing='ease-in'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>ease-out</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Termine lentement
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`easing='ease-out'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>ease-in-out</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Lent au début et à la fin
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>{`easing='ease-in-out'`}</code>
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>cubic-bezier()</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Courbe personnalisée
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>
                                            {`easing='cubic-bezier(.4,0,.2,1)'`}
                                        </code>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Button } from '@lockness/ui/components'

// Basic button
<Button variant='primary' size='md'>
  Click me
</Button>

// As link with Unpoly (auto-detected from href)
<Button href='/dashboard'>
  Go to Dashboard
</Button>

// With all Unpoly options
<Button
  href='/next'
  target='.content'
  transition='move-left'
  duration={200}
  easing='ease-out'
  failTransition='fade'
  preload
>
  Next Page
</Button>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
